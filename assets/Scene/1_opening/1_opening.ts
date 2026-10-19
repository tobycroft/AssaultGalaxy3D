import { _decorator, Component, Node, Vec3, tween, resources, Prefab, instantiate, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_PATH = 'Model/spaceship/default_hq';
const DOLLY_FAR = 500;
const DOLLY_NEAR = 50;
const DOLLY_DURATION = 3.0;
const ORBIT_DURATION = 4.0;
const ORBIT_EASING = 'cubicInOut';

@ccclass('Opening')
export class Opening extends Component {

    private cameraRig: Node | null = null;
    private cameraNode: Node | null = null;

    onLoad(): void {
        this.findCameraNodes();
        this.loadShip();
    }

    private findCameraNodes(): void {
        this.cameraRig = this.node.getChildByName('CameraRig');
        if (!this.cameraRig) {
            warn('[Opening] CameraRig node not found');
            return;
        }
        this.cameraNode = this.cameraRig.getChildByName('Camera');
        if (!this.cameraNode) {
            warn('[Opening] Camera node not found');
        }
    }

    private loadShip(): void {
        resources.load(SHIP_PATH, Prefab, (err, prefab) => {
            if (err || !prefab) {
                warn('[Opening] Failed to load ship model:', err);
                return;
            }
            const ship = instantiate(prefab);
            ship.setPosition(0, 0, 0);
            this.node.addChild(ship);
            this.startCameraAnimation();
        });
    }

    private startCameraAnimation(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        this.cameraRig.setPosition(0, 0, 0);
        this.cameraRig.setRotationFromEuler(0, 0, 0);
        this.cameraNode.setPosition(0, 0, DOLLY_FAR);

        const camPos = this.cameraNode.position.clone();
        camPos.z = DOLLY_NEAR;

        tween(this.cameraNode)
            .to(DOLLY_DURATION, { position: camPos }, { easing: 'cubicInOut' })
            .call(() => {
                this.startOrbit();
            })
            .start();
    }

    private startOrbit(): void {
        if (!this.cameraRig) return;

        const targetEuler = new Vec3(0, 360, 0);

        tween(this.cameraRig)
            .to(ORBIT_DURATION, { eulerAngles: targetEuler }, { easing: ORBIT_EASING })
            .start();
    }
}