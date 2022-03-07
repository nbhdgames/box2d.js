(function () {
  class LevelStateMachine {
    constructor(game, data, onOver) {
      this.game = game;
      this.data = data;
      this.onOver = onOver;
    }
    enter() {}
    leave() {}
    step(dt) {}
  }

  class StateMachineContainer extends LevelStateMachine {
    states;
    enter() {
      this.states = new Set();
    }
    enterSubState(data) {
      const state = loadLevel(this.game, data, () => {
        this.states.delete(state);
        if (this.states.size === 0) {
          this.onSubStateDrain();
        }
      });
      state.enter();
      this.states.add(state);
    }
    leave() {
      for (const sub of this.states) {
        sub.leave();
      }
      this.states = null;
    }
    step(dt) {
      for (const sub of this.states) {
        sub.step(dt);
      }
    }
    onSubStateDrain() {
      this.onOver();
    }
  }

  class ParellelStateMachine extends StateMachineContainer {
    enter() {
      super.enter();
      for (const sub of this.data.states) {
        this.enterSubState(sub);
      }
    }
  }

  class IntervalStateMachine extends StateMachineContainer {
    index;
    nextAfter;

    enter() {
      super.enter();
      this.index = 0;
      this.nextAfter = this.data.delay;
    }
    step(dt) {
      if (this.index >= this.data.count) {
        return;
      }
      this.nextAfter -= dt;
      while (this.nextAfter < 0 && this.index < this.data.count) {
        this.nextAfter += this.data.interval;
        this.index++;
        this.enterSubState(this.data.each);
      }
    }
    onSubStateDrain() {
      // Only over after all interval fired.
      if (this.index >= this.data.count) {
        this.onOver();
      }
    }
  }

  class CreateEnemyMachine extends LevelStateMachine {
    enter() {
      this.game.addEnemy(
        new SparkEnemy(this.game, this.data.enemy, () => {
          this.onOver();
        })
      );
    }
  }

  const stateClasses = {
    parellel: ParellelStateMachine,
    interval: IntervalStateMachine,
    createEnemy: CreateEnemyMachine,
  };

  function noop() {}
  function loadLevel(game, data, onOver) {
    const Clazz = stateClasses[data.type];
    return new Clazz(game, data, onOver || noop);
  }
  window.loadLevel = loadLevel;
})();
