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
  }

  class FollowUpStateMachine extends UnitStateMachine {
    enter() {
      this.unit.body.SetType(b2_dynamicBody);
    }
    leave() {
      this.unit.body.SetType(b2_kinematicBody);
    }
    step() {
      this.unit.followUp();
      const { shootMethod } = this.unit;

      // Only shoot while has targets.
      if (shootMethod) {
        if (shootMethod.isGood && !shootMethod.shooting) {
          shootMethod.start();
        } else if (!shootMethod.isGood && shootMethod.shooting) {
          shootMethod.stop();
        }
      }
    }
  }

  const stateClasses = {
    followUp: FollowUpStateMachine,
  };

  function loadStateMachine(unit, data) {
    const Clazz = stateClasses[data.type];
    return new Clazz(unit, data);
  }
  window.loadStateMachine = loadStateMachine;
})();
