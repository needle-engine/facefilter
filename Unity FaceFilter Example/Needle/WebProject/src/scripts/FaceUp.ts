import { Animator, Behaviour, isDevEnvironment, serializable } from "@needle-tools/engine";
import { Vector3 } from "three";

const up = new Vector3(0, 1, 0);

export class FaceUp extends Behaviour {

    @serializable(Animator)
    animator: Animator | null = null;

    start() {
        if (!this.animator) this.animator = this.gameObject.getComponent(Animator);
        console.log("Hello FaceUp", this);
    }

    update() {
        if (this.context.time.frame % 20 === 0) {
            const res = this.gameObject.worldUp.dot(up);
            this.animator?.setFloat("up", res);
            if (isDevEnvironment()) console.log("dot up:", res);
        }
    }

}