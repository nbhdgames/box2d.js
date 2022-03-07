window.createState = (function () {
  class State {
    constructor(unit) {
      this.unit = unit;
    }
    enter() {}
    leave() {}
    step() {}
  }

  class FollowUpState extends State {
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

  const stateClasses = {
    followUp: FollowUpState,
  };

  function createState(unit, data) {
    const Clazz = stateClasses[data.type];
    return new Clazz(unit, data);
  }
  return createState;
})();
