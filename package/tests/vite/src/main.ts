import { ObjectUtils, onStart } from "@needle-tools/engine";
import "@needle-tools/facefilter";
import { NeedleTrackingManager } from "@needle-tools/facefilter";


onStart((ctx) => {
    ctx.menu.showQRCodeButton(true);
    const t = NeedleTrackingManager.instance;
    console.log(t);
    if (t) {
        t.maxFaces = 1;
        t.maxHands = 2;

        setTimeout(() => {
            const cube = ObjectUtils.createPrimitive("Cube", { scale: .05 });
            t.hands[0].attachToHand(cube, "index_finger_tip")
        }, 3000)

        // setTimeout(() => {
        //     t.maxHands = 2;
        //     setTimeout(() => {
        //         t.maxFaces = 0;
        //         setTimeout(() => {
        //             t.maxHands = 1;
        //             setTimeout(()=> {
        //                 t.maxHands = 0;
        //                 setTimeout(()=> {
        //                     t.maxFaces = 1;
        //                     t.maxHands = 2;
        //                 }, 2000)
        //             }, 2000)
        //         }, 2000)
        //     }, 3000)
        // }, 3000)
    }
})