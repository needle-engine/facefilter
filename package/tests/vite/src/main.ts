import { onStart } from "@needle-tools/engine";
import "@needle-tools/facefilter";
import { NeedleTrackingManager } from "@needle-tools/facefilter";


onStart(() => {
    const t = NeedleTrackingManager.instance;
    console.log(t);
    if (t) {
        setTimeout(() => {
            t.maxHands = 2;
            setTimeout(() => {
                t.maxFaces = 0;
                setTimeout(() => {
                    t.maxHands = 1;
                    setTimeout(()=> {
                        t.maxHands = 0;
                    }, 2000)
                }, 2000)
            }, 3000)
        }, 3000)
    }
})