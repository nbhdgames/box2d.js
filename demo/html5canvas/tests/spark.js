const MOVE_LEFT = 0x01;
const MOVE_RIGHT = 0x02;
const MOVE_UP = 0x04;
const MOVE_DOWN = 0x08;

const PLAYER_SIZE = 1;

const SPEED = 20;

const GROUP_PLAYER = 1;
const GROUP_ENEMY = 2;
const GROUP_MISSLE = -2;
const GROUP_EDGE = -3;
const GROUP_WALL = -4;

const CAT_PLAYER = 1;
const CAT_ENEMY = 2;
const CAT_PLAYER_MISSLE = 4;
const CAT_ENEMY_MISSLE = 8;
const CAT_WALL = 16;
const CAT_EDGE = 32;
const CAT_ALL = 0xffff;

// TODO: remove this, use attack range contact instead.
const FOLLOW_UP_DISTANCE = 3;

function createFilter(cat, mask, group) {
  let ret;
  return function () {
    if (!ret) {
      ret = new b2Filter();
      ret.set_categoryBits(cat);
      ret.set_maskBits(mask);
      ret.set_groupIndex(group);
    }
    return ret;
  };
}

const playerFilter = createFilter(
  CAT_PLAYER,
  CAT_ENEMY | CAT_ENEMY_MISSLE | CAT_WALL,
  GROUP_PLAYER
);
const enemyFilter = createFilter(
  CAT_ENEMY,
  CAT_PLAYER | CAT_PLAYER_MISSLE,
  GROUP_ENEMY
);
const playerMissleFilter = createFilter(
  CAT_PLAYER_MISSLE,
  CAT_ENEMY | CAT_EDGE,
  GROUP_MISSLE
);
const enemyMissleFilter = createFilter(
  CAT_ENEMY_MISSLE,
  CAT_PLAYER | CAT_EDGE,
  GROUP_MISSLE
);
const wallFilter = createFilter(CAT_WALL, CAT_PLAYER, GROUP_WALL);

const edgeFilter = createFilter(
  CAT_EDGE,
  CAT_ENEMY_MISSLE | CAT_PLAYER_MISSLE,
  GROUP_EDGE
);

const atkRange = [
  [0, 0],
  [Math.cos(Math.PI / 4) * 4, -Math.sin(Math.PI / 4) * 4],
  [Math.cos(Math.PI / 8) * 4, -Math.sin(Math.PI / 8) * 4],
  [4, 0],
  [Math.cos(Math.PI / 8) * 4, Math.sin(Math.PI / 8) * 4],
  [Math.cos(Math.PI / 4) * 4, Math.sin(Math.PI / 4) * 4],
];

class SparkUnit {
  body;
  speedObj = new b2Vec2();
  target;
  size = 0;
  atkRangeEnemySet = new Set();

  constructor(game, data) {
    this.size = data.size;
    this.setupBody(game, data);
    this.setupAttackRange(game, data);
  }

  setupBody(game, { race, x, y, angle, size }) {
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(race === GROUP_PLAYER ? b2_dynamicBody : b2_kinematicBody);
    bodyDef.set_position(new b2Vec2(x, y));
    bodyDef.set_angle(angle);
    this.body = world.CreateBody(bodyDef);

    const circleShape = new b2CircleShape();
    circleShape.set_m_radius(size);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(circleShape);
    fixDef.set_filter(race === GROUP_PLAYER ? playerFilter() : enemyFilter());
    fixDef.set_density(1);
    fixDef.set_userData(game.registerUserData(this));
    this.body.CreateFixture(fixDef);
  }

  setupAttackRange(game, { race, size }) {
    // attack range.
    const sensorShape = createPolygonShape(
      atkRange.map((v) => new b2Vec2(v[0] * size, v[1] * size))
    );
    const fixDef1 = new b2FixtureDef();
    fixDef1.set_shape(sensorShape);
    fixDef1.set_filter(
      race === GROUP_PLAYER ? playerMissleFilter() : enemyMissleFilter()
    );
    fixDef1.set_isSensor(true);
    fixDef1.set_userData(
      game.registerUserData({
        onBeginContact: (other) => {
          if (other instanceof SparkUnit) {
            this.atkRangeEnemySet.add(other);
          }
        },
        onEndContact: (other) => {
          this.atkRangeEnemySet.delete(other);
        },
      })
    );
    this.body.CreateFixture(fixDef1);
  }

  setVelocity(vx, vy) {
    this.speedObj.Set(vx * SPEED, vy * SPEED);
    this.body.SetLinearVelocity(this.speedObj);
  }

  faceToTarget() {
    if (!this.target) {
      return;
    }
    const myPos = this.body.GetPosition();
    const tarPos = this.target.body.GetPosition();

    const dx = tarPos.get_x() - myPos.get_x();
    const dy = tarPos.get_y() - myPos.get_y();
    this.body.SetTransform(myPos, Math.atan2(dy, dx));
  }
  followUp() {
    if (!this.target) {
      return;
    }
    const myPos = this.body.GetPosition();
    const tarPos = this.target.body.GetPosition();

    const dx = tarPos.get_x() - myPos.get_x();
    const dy = tarPos.get_y() - myPos.get_y();
    // face to target
    this.body.SetTransform(myPos, Math.atan2(dy, dx));
    // const expectDis = this.size * FOLLOW_UP_DISTANCE + this.target.size;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (!this.atkRangeEnemySet.has(this.target)) {
      // move closer.
      const vx = (dx * this.speed) / d;
      const vy = (dy * this.speed) / d;
      this.speedObj.Set(vx, vy);
      this.body.SetLinearVelocity(this.speedObj);
    } else {
      this.speedObj.Set(0, 0);
      this.body.SetLinearVelocity(this.speedObj);
    }
  }
}

/**
 * 玩家对象。
 */
class SparkPlayer extends SparkUnit {
  moveFlags = 0;

  constructor(game) {
    super(game, {
      race: GROUP_PLAYER,
      x: 0,
      y: 10,
      angle: Math.PI / -2,
      size: PLAYER_SIZE,
    });
  }

  moveKeyDown(flag) {
    this.moveFlags |= flag;
    this.updateVelocity();
  }

  moveKeyUp(flag) {
    this.moveFlags &= ~flag;
    this.updateVelocity();
  }

  updateVelocity() {
    let vx = 0,
      vy = 0;
    if (this.moveFlags & MOVE_LEFT) {
      vx = -1;
    } else if (this.moveFlags & MOVE_RIGHT) {
      vx = 1;
    }

    if (this.moveFlags & MOVE_UP) {
      vy = -1;
    } else if (this.moveFlags & MOVE_DOWN) {
      vy = 1;
    }
    const d = Math.sqrt(vx * vx + vy * vy);
    if (d > 1) {
      vx /= d;
      vy /= d;
    }
    this.setVelocity(vx, vy);
  }

  step() {
    this.updateVelocity();
  }
}

class SparkEnemy extends SparkUnit {
  data;
  state;
  onKilled;

  constructor(game, data, onKilled) {
    super(game, {
      race: GROUP_ENEMY,
      x: data.x,
      y: data.y,
      angle: Math.PI / 2,
      size: data.size,
    });
    this.data = data;
    this.setupState();
    this.onKilled = onKilled;
  }

  get speed() {
    return this.data.speed;
  }

  setupState() {
    this.state = loadStateMachine(this, this.data.state, () => {
      this.state = null;
    });
    this.state.enter();
  }

  step() {
    if (this.state) {
      this.state.step();
    }
  }
}

class SparkWall {
  body;
  constructor() {
    this.setup();
  }
  setup() {
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(b2_staticBody);
    bodyDef.set_userData(this);
    this.body = world.CreateBody(bodyDef);

    this.createBox(25, 1, 0, -33);
    this.createBox(25, 1, 0, 33);
    this.createBox(1, 33, -25, 0);
    this.createBox(1, 33, 25, 0);
  }
  createBox(hx, hy, x, y) {
    const box = new b2PolygonShape();
    box.SetAsBox(hx, hy, new b2Vec2(x, y), 0);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(box);
    fixDef.set_filter(wallFilter());
    fixDef.set_density(1);
    this.body.CreateFixture(fixDef);
  }
}

class SparkEdge {
  body;
  constructor() {
    this.setup();
  }
  setup() {
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(b2_staticBody);
    bodyDef.set_userData(this);
    this.body = world.CreateBody(bodyDef);

    this.createBox(35, 1, 0, -43);
    this.createBox(35, 1, 0, 43);
    this.createBox(1, 43, -35, 0);
    this.createBox(1, 43, 35, 0);
  }
  createBox(hx, hy, x, y) {
    const box = new b2PolygonShape();
    box.SetAsBox(hx, hy, new b2Vec2(x, y), 0);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(box);
    fixDef.set_filter(wallFilter());
    fixDef.set_density(1);
    fixDef.set_isSensor(true);
    this.body.CreateFixture(fixDef);
  }
}

class SparkGame {
  player;
  wall;
  edge;
  level;
  enemies = new Set();

  userDataRegistry = new Map();
  userDataRegistryId = 0;

  registerUserData(obj) {
    const ret = ++this.userDataRegistryId;
    this.userDataRegistry.set(ret, obj);
    return ret;
  }

  getUserData(id) {
    return id && this.userDataRegistry.get(id);
  }

  freeUserData(id) {
    this.userDataRegistry.delete(id);
  }

  setNiceViewCenter() {
    PTM = 10;
    setViewCenterWorld(new b2Vec2(0, 0), true);
  }

  setup() {
    world.SetGravity(new b2Vec2(0, 0));
    this.player = new SparkPlayer(this);
    this.wall = new SparkWall();
    this.edge = new SparkEdge();
    this.listenContact();
  }

  listenContact() {
    const listener = new Box2D.JSContactListener();
    listener.BeginContact = (contactPtr) => {
      var contact = Box2D.wrapPointer(contactPtr, b2Contact);
      const a = this.getUserData(contact.GetFixtureA().GetUserData());
      const b = this.getUserData(contact.GetFixtureB().GetUserData());
      if (a && b) {
        if (a.onBeginContact) {
          a.onBeginContact(b);
        }
        if (b.onBeginContact) {
          b.onBeginContact(a);
        }
      }
    };
    listener.EndContact = (contactPtr) => {
      var contact = Box2D.wrapPointer(contactPtr, b2Contact);
      const a = this.getUserData(contact.GetFixtureA().GetUserData());
      const b = this.getUserData(contact.GetFixtureB().GetUserData());
      if (a && b) {
        if (a.onEndContact) {
          a.onEndContact(b);
        }
        if (b.onEndContact) {
          b.onEndContact(a);
        }
      }
    };
    listener.PreSolve = () => {};
    listener.PostSolve = () => {};
    world.SetContactListener(listener);
  }

  step(dt) {
    if (this.player) {
      this.player.step();
    }
    for (const enemy of this.enemies) {
      enemy.step();
    }
    if (this.level) {
      this.level.step(dt);
    }
  }

  onKeyDown(canvas, evt) {
    if (evt.code == "KeyW") {
      this.player.moveKeyDown(MOVE_UP);
    } else if (evt.code == "KeyS") {
      this.player.moveKeyDown(MOVE_DOWN);
    } else if (evt.code === "KeyA") {
      this.player.moveKeyDown(MOVE_LEFT);
    } else if (evt.code === "KeyD") {
      this.player.moveKeyDown(MOVE_RIGHT);
    }
  }

  onKeyUp(canvas, evt) {
    if (evt.code == "KeyW") {
      this.player.moveKeyUp(MOVE_UP);
    } else if (evt.code == "KeyS") {
      this.player.moveKeyUp(MOVE_DOWN);
    } else if (evt.code === "KeyA") {
      this.player.moveKeyUp(MOVE_LEFT);
    } else if (evt.code === "KeyD") {
      this.player.moveKeyUp(MOVE_RIGHT);
    }
  }
  addEnemy(enemy) {
    if (!(enemy instanceof SparkEnemy)) {
      enemy = new SparkEnemy(this, enemy);
    }
    this.enemies.add(enemy);
    enemy.target = this.player;
    return enemy;
  }
}

class embox2dTest_spark extends SparkGame {
  setup() {
    super.setup();
    this.level = loadLevel(this, {
      type: "parellel",
      states: [
        {
          type: "interval",
          interval: 1,
          count: 5,
          delay: 0,
          each: {
            type: "createEnemy",
            enemy: {
              x: -10,
              y: -40,
              hp: 100,
              size: 1,
              speed: 5,
              state: {
                type: "followUp",
              },
            },
          },
        },
        {
          type: "interval",
          interval: 1,
          count: 5,
          delay: 0,
          each: {
            type: "createEnemy",
            enemy: {
              x: 10,
              y: -40,
              hp: 100,
              size: 1,
              speed: 5,
              state: {
                type: "followUp",
              },
            },
          },
        },
      ],
    });
    this.level.enter();
    // for (let i = 0; i <= 10; i++) {
    //   this.addEnemy(
    //     new SparkEnemy({
    //       hp: 100,
    //       x: (i - 5) * 2,
    //       y: -32,
    //       size: 1,
    //       speed: 5,
    //       state: {
    //         type: "followUp",
    //       },
    //     })
    //   );
    // }
  }
  cleanup() {}
}
window.embox2dTest_spark = embox2dTest_spark;
