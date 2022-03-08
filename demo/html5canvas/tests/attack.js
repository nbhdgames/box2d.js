class ShootMethodBase {
  unit;
  data;
  shooting = false;
  nextShootAt = 0;

  constructor(unit, data) {
    this.unit = unit;
    this.data = data;
  }

  start() {
    if (!this.shooting) {
      this.shooting = true;
      this.nextShootAt = Math.max(this.nextShootAt, this.data.preTime);
    }
  }
  stop() {
    this.shooting = false;
  }
  step(dt) {
    this.nextShootAt -= dt;
    if (this.shooting && this.nextShootAt <= 0) {
      this.nextShootAt = this.data.preTime + this.data.postTime;
      this.shoot();
    }
  }
  /**
   * 是否明智使用，供AI参考。
   */
  get isGood() {
    return true;
  }
  shoot() {
    throw new Error("Not Implemented.");
  }
}

class AttackShootMethod extends ShootMethodBase {
  shoot() {
    const { dmg } = this.data;
    for (const enemy of this.unit.atkRangeEnemySet.keys()) {
      enemy.makeDamage(dmg);
    }
  }
  get isGood() {
    return this.unit.atkRangeEnemySet.size > 0;
  }
}

class AmmoShootMethod extends ShootMethodBase {
  shoot() {
    const { v, dmg } = this.data;
    this.unit.fireBullet(v, (target) => {
      target.makeDamage(dmg);
    });
  }
  get isGood() {
    return !!this.unit.target;
  }
}

const shootMethods = {
  attack: AttackShootMethod,
  ammo: AmmoShootMethod,
};

function loadShootMethod(unit, data) {
  const Clazz = shootMethods[data.type];
  return new Clazz(unit, data);
}
