(function () {
  class UnitStateMachine {
    constructor(unit, data, onOver) {
      this.unit = unit;
      this.data = data;
      this.onOver = onOver;
    }
    enter() {}
    leave() {}
    step() {}
    over() {
      if (this.onOver) {
        this.onOver();
        this.onOver = null;
      }
    }
  }

  class FollowUpState extends UnitStateMachine {
    enter() {
      this.unit.body.SetType(b2_dynamicBody);
    }
    leave() {
      this.unit.body.SetType(b2_kinematicBody);
    }
    step() {
      this.unit.followUp();
    }
  }

  class MoveToState extends UnitStateMachine {
    step() {
      if (this.unit.moveTo(this.data.x, this.data.y)) {
        this.over();
      }
      this.unit.faceToTarget();
    }
  }

  const stateClasses = {
    followUp: FollowUpState,
    moveTo: MoveToState,
  };

  function loadStateMachine(unit, data) {
    const Clazz = stateClasses[data.type];
    return new Clazz(unit, data);
  }
  window.loadStateMachine = loadStateMachine;
})();
