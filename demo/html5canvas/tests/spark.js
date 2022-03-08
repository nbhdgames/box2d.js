const MOVE_LEFT = 0x01;
const MOVE_RIGHT = 0x02;
const MOVE_UP = 0x04;
const MOVE_DOWN = 0x08;

const PLAYER_SIZE = 1;
const PLAYER_SPEED = 20;

const GROUP_PLAYER = 1;
const GROUP_ENEMY = 2;
const GROUP_BULLET = -2;
const GROUP_EDGE = -3;
const GROUP_WALL = -4;

const CAT_PLAYER = 1;
const CAT_ENEMY = 2;
const CAT_PLAYER_BULLET = 4;
const CAT_ENEMY_BULLET = 8;
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
  CAT_ENEMY | CAT_ENEMY_BULLET | CAT_WALL,
  GROUP_PLAYER
);
const enemyFilter = createFilter(
  CAT_ENEMY,
  CAT_PLAYER | CAT_PLAYER_BULLET,
  GROUP_ENEMY
);
const playerBulletFilter = createFilter(
  CAT_PLAYER_BULLET,
  CAT_ENEMY | CAT_EDGE,
  GROUP_BULLET
);
const enemyBulletFilter = createFilter(
  CAT_ENEMY_BULLET,
  CAT_PLAYER | CAT_EDGE,
  GROUP_BULLET
);
const wallFilter = createFilter(CAT_WALL, CAT_PLAYER, GROUP_WALL);

const edgeFilter = createFilter(
  CAT_EDGE,
  CAT_ENEMY_BULLET | CAT_PLAYER_BULLET,
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

class SparkBullet {
  unit;
  data;
  body;
  ud;
  exploded = false;
  explodeAtUnits = new Set();

  constructor(unit, data, onExplode) {
    this.unit = unit;
    this.data = data;
    this.onExplode = onExplode;
    this.ud = unit.game.registerUserData(this);
    this.setup();
  }
  setup() {
    const race = this.unit.race;
    const { x, y, vx, vy, size } = this.data;
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(b2_dynamicBody);
    bodyDef.set_bullet(true);
    bodyDef.set_position(new b2Vec2(x, y));
    bodyDef.set_linearVelocity(new b2Vec2(vx, vy));
    this.body = world.CreateBody(bodyDef);

    const circleShape = new b2CircleShape();
    circleShape.set_m_radius(size);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(circleShape);
    fixDef.set_filter(
      race === GROUP_PLAYER ? playerBulletFilter() : enemyBulletFilter()
    );
    fixDef.set_density(1);
    fixDef.set_isSensor(true);
    fixDef.set_userData(this.ud);
    this.body.CreateFixture(fixDef);
  }

  explode() {
    this.unit.game.freeUserData(this.ud);
    world.DestroyBody(this.body);
    for (const item of this.explodeAtUnits) {
      this.onExplode(item);
    }
  }

  onBeginContact(other) {
    if (other instanceof SparkUnit) {
      this.explodeAtUnits.add(other);
    }
    if (!this.exploded) {
      this.exploded = true;
      this.unit.game.explodingBullets.push(this);
    }
  }
}

class SparkUnit {
  data;
  game;
  body;
  speedObj = new b2Vec2();
  target;
  atkRangeEnemySet = new Map();
  destroyed = false;
  shootMethod;
  hp;

  userDatas = new Set();

  constructor(game, data) {
    this.game = game;
    this.data = data;
    this.hp = data.hp;
    this.setupBody();
    this.setupAttackRange();
    if (data.shootMethod) {
      this.shootMethod = loadShootMethod(this, data.shootMethod);
    }
  }

  get race() {
    return GROUP_ENEMY;
  }

  registerUserData(obj) {
    const ret = this.game.registerUserData(obj);
    this.userDatas.add(ret);
    return ret;
  }

  setupBody() {
    const { race } = this;
    const { x, y, angle = 0, size } = this.data;
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
    fixDef.set_userData(this.registerUserData(this));
    this.body.CreateFixture(fixDef);
  }

  setupAttackRange() {
    const { race } = this;
    const { size } = this.data;
    // attack range.
    const sensorShape = createPolygonShape(
      atkRange.map((v) => new b2Vec2(v[0] * size, v[1] * size))
    );
    const fixDef1 = new b2FixtureDef();
    fixDef1.set_shape(sensorShape);
    fixDef1.set_filter(
      race === GROUP_PLAYER ? playerBulletFilter() : enemyBulletFilter()
    );
    fixDef1.set_isSensor(true);
    fixDef1.set_userData(
      this.registerUserData({
        onBeginContact: (other) => {
          if (other instanceof SparkUnit) {
            if (this.atkRangeEnemySet.has(other)) {
              this.atkRangeEnemySet.set(
                other,
                this.atkRangeEnemySet.get(other) + 1
              );
            } else {
              this.atkRangeEnemySet.set(other, 1);
            }
          }
        },
        onEndContact: (other) => {
          if (other instanceof SparkUnit) {
            if (this.atkRangeEnemySet.has(other)) {
              const v = this.atkRangeEnemySet.get(other) - 1;
              if (v > 0) {
                this.atkRangeEnemySet.set(other, v);
              } else {
                this.atkRangeEnemySet.delete(other);
              }
            }
          }
        },
      })
    );
    this.body.CreateFixture(fixDef1);
  }

  setVelocity(vx, vy) {
    this.speedObj.Set(vx * this.speed, vy * this.speed);
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
    if (!this.target || this.target.destroyed) {
      this.setVelocity(0, 0);
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
      const vx = dx / d;
      const vy = dy / d;
      this.setVelocity(vx, vy);
    } else {
      this.setVelocity(0, 0);
    }
  }

  get speed() {
    return this.data.speed;
  }

  startShoot() {
    if (this.shootMethod) {
      this.shootMethod.start();
    }
  }

  stopShoot() {
    if (this.shootMethod) {
      this.shootMethod.stop();
    }
  }

  step(dt) {
    if (this.shootMethod) {
      this.shootMethod.step(dt);
    }
    // target may be killed during shoot.
    if (this.target && this.target.destroyed) {
      this.target = null;
    }
  }

  makeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp < 0) {
      this.kill();
    }
  }

  kill() {
    if (this.destroyed) {
      return;
    }
    // assume all contact to be over.
    for (
      let edge = this.body.GetContactList();
      Box2D.getPointer(edge);
      edge = edge.get_next()
    ) {
      this.game.onEndContact(edge.get_contact());
    }

    this.destroyed = true;
    for (const ud of this.userDatas) {
      this.game.freeUserData(ud);
    }
    this.userDatas.clear();

    // Destroy physics body;
    world.DestroyBody(this.body);
    this.body = null;
  }

  fireBullet(v, onExplode) {
    const pos = this.body.GetPosition();
    const a = this.body.GetAngle();
    const x = pos.get_x();
    const y = pos.get_y();
    new SparkBullet(
      this,
      {
        x,
        y,
        size: 0.2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
      },
      onExplode
    );
  }
}

/**
 * 玩家对象。
 */
class SparkPlayer extends SparkUnit {
  moveFlags = 0;

  constructor(game, data) {
    super(game, data);
  }

  get race() {
    return GROUP_PLAYER;
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

  switchTarget() {
    const enemies = [...this.game.enemies];
    const idx = enemies.indexOf(this.target); // or -1
    this.target = enemies[(idx + 1) % enemies.length];
  }

  step(dt) {
    super.step(dt);
    if (!this.target && this.game.enemies.size) {
      this.switchTarget();
    }
    this.updateVelocity();
    this.faceToTarget();
  }
}

class SparkEnemy extends SparkUnit {
  state;
  onKilled;

  constructor(game, data, onKilled) {
    super(game, data);
    this.onKilled = onKilled;
    this.setupState();
  }

  setupState() {
    if (this.data.state) {
      this.state = loadStateMachine(this, this.data.state, () => {
        console.log("Good bye.");
        this.state = null;
      });
      this.state.enter();
    }
  }

  step(dt) {
    super.step(dt);
    if (this.state) {
      this.state.step(dt);
    }
    // Only shoot while has targets.
    if (this.shootMethod) {
      if (this.shootMethod.isGood && !this.shootMethod.shooting) {
        this.shootMethod.start();
      } else if (!this.shootMethod.isGood && this.shootMethod.shooting) {
        this.shootMethod.stop();
      }
    }
  }

  kill() {
    super.kill();
    this.game.enemies.delete(this);
    this.onKilled();
  }
}

class SparkWall {
  game;
  body;
  constructor(game) {
    this.game = game;
    this.setup();
  }
  setup() {
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(b2_staticBody);
    this.body = world.CreateBody(bodyDef);

    const ud = this.game.registerUserData(this);
    this.createBox(ud, 25, 1, 0, -33);
    this.createBox(ud, 25, 1, 0, 33);
    this.createBox(ud, 1, 33, -25, 0);
    this.createBox(ud, 1, 33, 25, 0);
  }
  createBox(ud, hx, hy, x, y) {
    const box = new b2PolygonShape();
    box.SetAsBox(hx, hy, new b2Vec2(x, y), 0);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(box);
    fixDef.set_filter(wallFilter());
    fixDef.set_density(1);
    fixDef.set_userData(ud);
    this.body.CreateFixture(fixDef);
  }
}

class SparkEdge {
  game;
  body;
  constructor(game) {
    this.game = game;
    this.setup();
  }
  setup() {
    const bodyDef = new b2BodyDef();
    bodyDef.set_fixedRotation(true);
    bodyDef.set_type(b2_staticBody);
    this.body = world.CreateBody(bodyDef);

    const ud = this.game.registerUserData(this);
    this.createBox(ud, 54, 10, 0, -62);
    this.createBox(ud, 54, 10, 0, 62);
    this.createBox(ud, 10, 62, -54, 0);
    this.createBox(ud, 10, 62, 54, 0);
  }
  createBox(ud, hx, hy, x, y) {
    const box = new b2PolygonShape();
    box.SetAsBox(hx, hy, new b2Vec2(x, y), 0);
    const fixDef = new b2FixtureDef();
    fixDef.set_shape(box);
    fixDef.set_filter(edgeFilter());
    fixDef.set_isSensor(true);
    fixDef.set_userData(ud);
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

  /**
   * 在物理环节推算出会爆炸的飞弹（可能击中了目标或墙壁）
   */
  explodingBullets = [];

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
    this.wall = new SparkWall(this);
    this.edge = new SparkEdge(this);
    this.listenContact();
  }

  onBeginContact(contact) {
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
  }

  onEndContact(contact) {
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
  }

  listenContact() {
    const listener = new Box2D.JSContactListener();
    listener.BeginContact = (contactPtr) => {
      this.onBeginContact(Box2D.wrapPointer(contactPtr, b2Contact));
    };
    listener.EndContact = (contactPtr) => {
      this.onEndContact(Box2D.wrapPointer(contactPtr, b2Contact));
    };
    listener.PreSolve = () => {};
    listener.PostSolve = () => {};
    world.SetContactListener(listener);
  }

  step(dt) {
    if (this.player && !this.player.destroyed) {
      this.player.step(dt);
    }
    for (const enemy of this.enemies) {
      enemy.step(dt);
    }
    if (this.level) {
      this.level.step(dt);
    }
    for (const bullet of this.explodingBullets) {
      bullet.explode();
    }
    this.explodingBullets.splice(0);
  }

  onKeyDown(canvas, evt) {
    evt.preventDefault();
    evt.stopPropagation();
    if (this.player.destroyed) {
      return;
    }
    if (evt.code == "KeyW") {
      this.player.moveKeyDown(MOVE_UP);
    } else if (evt.code == "KeyS") {
      this.player.moveKeyDown(MOVE_DOWN);
    } else if (evt.code === "KeyA") {
      this.player.moveKeyDown(MOVE_LEFT);
    } else if (evt.code === "KeyD") {
      this.player.moveKeyDown(MOVE_RIGHT);
    } else if (evt.code === "KeyJ") {
      if (!this.player.target) {
        this.player.switchTarget();
      }
      this.player.startShoot();
    } else if (evt.code === "Tab") {
      this.player.switchTarget();
    }
  }

  onKeyUp(canvas, evt) {
    if (this.player.destroyed) {
      return;
    }
    if (evt.code == "KeyW") {
      this.player.moveKeyUp(MOVE_UP);
    } else if (evt.code == "KeyS") {
      this.player.moveKeyUp(MOVE_DOWN);
    } else if (evt.code === "KeyA") {
      this.player.moveKeyUp(MOVE_LEFT);
    } else if (evt.code === "KeyD") {
      this.player.moveKeyUp(MOVE_RIGHT);
    } else if (evt.code === "KeyJ") {
      this.player.stopShoot();
    }
  }
  addEnemy(enemy) {
    this.enemies.add(enemy);
    enemy.target = this.player;
    if (!this.player.target) {
      this.player.target = enemy;
    }
    return enemy;
  }

  cleanup() {}
}

class embox2dTest_spark extends SparkGame {
  setup() {
    super.setup();

    this.player = new SparkPlayer(this, {
      race: GROUP_PLAYER,
      x: 0,
      y: 10,
      hp: 100,
      angle: Math.PI / -2,
      size: PLAYER_SIZE,
      speed: PLAYER_SPEED,
      shootMethod: {
        type: "attack",
        preTime: 0.2,
        postTime: 0.3,
        dmg: 50,
      },
    });

    this.level = loadLevel(
      this,
      {
        type: "parellel",
        states: [
          {
            type: "interval",
            interval: 1,
            count: 10,
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
                shootMethod: {
                  type: "attack",
                  preTime: 0.2,
                  postTime: 0.3,
                  dmg: 50,
                },
              },
            },
          },
          {
            type: "interval",
            interval: 1,
            count: 10,
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
          // {
          //   type: "createEnemy",
          //   enemy: {
          //     x: 10,
          //     y: 10,
          //     hp: 100,
          //     size: 1,
          //     speed: 5,
          //     // state: {
          //     //   type: "followUp",
          //     // },
          //   },
          // },
          // {
          //   type: "createEnemy",
          //   enemy: {
          //     x: 10,
          //     y: 12,
          //     hp: 100,
          //     size: 1,
          //     speed: 5,
          //     // state: {
          //     //   type: "followUp",
          //     // },
          //   },
          // },
        ],
      },
      () => {
        console.log("Level completed!");
      }
    );
    this.level.enter();
  }
  cleanup() {
    super.cleanup();
  }
}
window.embox2dTest_spark = embox2dTest_spark;

class embox2dTest_arch extends SparkGame {
  setup() {
    super.setup();

    this.player = new SparkPlayer(this, {
      race: GROUP_PLAYER,
      x: 0,
      y: 10,
      hp: 100,
      angle: Math.PI / -2,
      size: PLAYER_SIZE,
      speed: PLAYER_SPEED,
      shootMethod: {
        type: "ammo",
        preTime: 0.1,
        postTime: 0.05,
        v: 40,
        dmg: 20,
      },
    });

    this.level = loadLevel(
      this,
      {
        type: "parellel",
        states: [
          {
            type: "interval",
            interval: 2,
            count: 10,
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
                shootMethod: {
                  type: "attack",
                  preTime: 0.2,
                  postTime: 0.3,
                  dmg: 50,
                },
              },
            },
          },
          {
            type: "interval",
            interval: 2,
            count: 10,
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
                shootMethod: {
                  type: "attack",
                  preTime: 1,
                  postTime: 1,
                  dmg: 50,
                },
              },
            },
          },
          {
            type: "interval",
            interval: 2,
            count: 10,
            delay: 1,
            each: {
              type: "createEnemy",
              enemy: {
                x: -20,
                y: -40,
                hp: 100,
                size: 1,
                speed: 5,
                state: {
                  type: "followUp",
                },
                shootMethod: {
                  type: "ammo",
                  v: 10,
                  preTime: 1,
                  postTime: 1,
                  dmg: 20,
                },
              },
            },
          },
          {
            type: "interval",
            interval: 2,
            count: 10,
            delay: 1,
            each: {
              type: "createEnemy",
              enemy: {
                x: 20,
                y: -40,
                hp: 100,
                size: 1,
                speed: 5,
                state: {
                  type: "followUp",
                },
                shootMethod: {
                  type: "ammo",
                  v: 10,
                  preTime: 1,
                  postTime: 1,
                  dmg: 20,
                },
              },
            },
          },
        ],
      },
      () => {
        console.log("Level completed!");
      }
    );
    this.level.enter();
  }
  cleanup() {
    super.cleanup();
  }
}
window.embox2dTest_arch = embox2dTest_arch;
