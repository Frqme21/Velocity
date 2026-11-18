import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import {
  buildDefaultRegistry,
  type ComponentDef,
  type ComponentRegistry,
  type ComponentType,
  type ComponentProps,
  type LevelData,
} from '../world/components/registry';
import { MaterialRegistry } from '../world/components/materials';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import { ScaleGizmo } from '@babylonjs/core/Gizmos/scaleGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';

interface Instance {
  id: string;
  type: ComponentType;
  props: ComponentProps;
  mesh: BABYLON.AbstractMesh;
  body?: RAPIER.RigidBody;
  hitbox?: BABYLON.Mesh;
  /** Collider half-extents captured at build time, for live gizmo scaling. */
  baseHalfExtents?: { x: number; y: number; z: number };
  baseScale?: [number, number, number];
}

export class Editor {
  private canvas: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private camera!: BABYLON.ArcRotateCamera;
  private light!: BABYLON.DirectionalLight;
  private shadowGen!: BABYLON.ShadowGenerator;
  private hl!: BABYLON.HighlightLayer;
  private physics!: RAPIER.World;
  private registry: ComponentRegistry;
  private materials!: MaterialRegistry;

  /** Babylon gizmo manager for position/rotation/scale manipulators. */
  private gizmoManager!: GizmoManager;
  /** Utility layer that draws gizmos on top of the scene. */
  private utilityLayer!: UtilityLayerRenderer;

  private instances: Instance[] = [];
  private selected: Instance | null = null;
  private counters = new Map<string, number>();

  // UI
  private readonly elLevelName: HTMLInputElement;
  private readonly elStatus: HTMLElement;
  private readonly elPalette: HTMLElement;
  private readonly elInspector: HTMLElement;
  /** Toolbar toggle: only tagged surfaces may be wall-run. */
  private readonly elWallRunStrict: HTMLInputElement;
  /** Toolbar toggle: only tagged surfaces may be mantled. */
  private readonly elMantleStrict: HTMLInputElement;
  /** Gizmo mode toolbar buttons. */
  private readonly elGizmoMove: HTMLButtonElement;
  private readonly elGizmoRotate: HTMLButtonElement;
  private readonly elGizmoScale: HTMLButtonElement;

  // Input / camera
  private pointerDown = false;
  private dragButton = -1;
  private dragObject = false;
  private lastPointer = { x: 0, y: 0 };
  /** Keyboard navigation state for WASD/QE viewport movement. */
  private keys = new Set<string>();

  /** Gizmo mode: 'translate' | 'rotate' | 'scale' | null. */
  private gizmoMode: 'translate' | 'rotate' | 'scale' | null = null;
  /** The instance actually attached to the gizmo when the drag began. */
  private dragTarget: Instance | null = null;
  /** Which gizmo started the current drag; only scale drags may change size. */
  private dragMode: 'translate' | 'rotate' | 'scale' | null = null;
  /** Object scale captured when a gizmo drag begins (for folding mesh.scaling). */
  private dragStartScale: [number, number, number] = [1, 1, 1];
  /** Mesh scaling at drag start; gizmo changes are measured relative to this. */
  private dragStartMeshScale: [number, number, number] = [1, 1, 1];
  private alpha = 0;
  private beta = 1.1;
  private radius = 26;
  private target = new BABYLON.Vector3(0, 1, 0);

  constructor() {
    this.canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    this.elLevelName = document.getElementById('level-name') as HTMLInputElement;
    this.elStatus = document.getElementById('status')!;
    this.elPalette = document.getElementById('palette')!;
    this.elInspector = document.getElementById('inspector')!;
    this.elWallRunStrict = document.getElementById('wallrun-strict') as HTMLInputElement;
    this.elMantleStrict = document.getElementById('mantle-strict') as HTMLInputElement;
    this.elGizmoMove = document.getElementById('btn-gizmo-move') as HTMLButtonElement;
    this.elGizmoRotate = document.getElementById('btn-gizmo-rotate') as HTMLButtonElement;
    this.elGizmoScale = document.getElementById('btn-gizmo-scale') as HTMLButtonElement;
    this.registry = buildDefaultRegistry();

    this.bindUI();
    this.buildPalette();
    this.init().catch((err) => {
      this.setStatus(`Failed to start editor: ${err}`);
      console.error(err);
    });
  }

  private setStatus(text: string) {
    this.elStatus.textContent = text;
  }

  private bindUI() {
    document.getElementById('btn-new')!.addEventListener('click', () => this.newLevel());
    document.getElementById('btn-save')!.addEventListener('click', () => this.saveLevel());
    document.getElementById('btn-load')!.addEventListener('click', () => this.loadLevel());
    document.getElementById('btn-delete-saved')!.addEventListener('click', () => this.deleteSavedLevel());
    document.getElementById('btn-duplicate')!.addEventListener('click', () => this.duplicateSelected());
    document.getElementById('btn-export')!.addEventListener('click', () => this.exportLevel());
    document.getElementById('btn-copy')!.addEventListener('click', () => this.copyLevel());
    document.getElementById('btn-play')!.addEventListener('click', () => this.playLevel());
    this.elLevelName.addEventListener('change', () => this.setStatus('Level renamed'));
    this.elGizmoMove.addEventListener('click', () => this.setGizmoMode('translate'));
    this.elGizmoRotate.addEventListener('click', () => this.setGizmoMode('rotate'));
    this.elGizmoScale.addEventListener('click', () => this.setGizmoMode('scale'));

    window.addEventListener('resize', () => this.engine.resize());
  }

  private async init() {
    await RAPIER.init();
    this.physics = new RAPIER.World({ x: 0, y: -20.32, z: 0 });

    this.engine = new BABYLON.Engine(this.canvas, true, { stencil: true });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.06, 0.09, 0.13, 1);
    this.scene.collisionsEnabled = false;

    // Shared material registry (same one the game loader uses → 1:1 export).
    this.materials = new MaterialRegistry(this.scene);

    const ambient = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.7;
    ambient.groundColor = new BABYLON.Color3(0.12, 0.15, 0.19);

    this.light = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, 0.3), this.scene);
    this.light.position = new BABYLON.Vector3(20, 40, -20);
    this.light.intensity = 1.1;

    this.shadowGen = new BABYLON.ShadowGenerator(1024, this.light);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.bias = 0.0005;

    this.camera = new BABYLON.ArcRotateCamera(
      'editor-cam',
      this.alpha,
      this.beta,
      this.radius,
      this.target,
      this.scene,
    );
    this.camera.inputs.clear();

    this.hl = new BABYLON.HighlightLayer('hl', this.scene);

    // Utility layer for gizmos (renders on top of everything).
    this.utilityLayer = new UtilityLayerRenderer(this.scene);
    this.utilityLayer.shouldRender = true;
    this.utilityLayer.utilityLayerScene.autoClearDepthAndStencil = false;

    // Gizmo manager with all three modes (translate, rotate, scale).
    this.gizmoManager = new GizmoManager(this.scene);
    this.gizmoManager.positionGizmoEnabled = false;
    this.gizmoManager.rotationGizmoEnabled = false;
    this.gizmoManager.scaleGizmoEnabled = false;
    this.gizmoManager.usePointerToAttachGizmos = false; // we handle attach manually

    const posGizmo = this.gizmoManager.gizmos.positionGizmo;
    const rotGizmo = this.gizmoManager.gizmos.rotationGizmo;
    const sclGizmo = this.gizmoManager.gizmos.scaleGizmo;

    if (posGizmo) {
      posGizmo.updateGizmoPositionToMatchAttachedMesh = true;
      posGizmo.snapDistance = 0;
    }
    if (rotGizmo) {
      rotGizmo.updateGizmoPositionToMatchAttachedMesh = true;
      rotGizmo.snapDistance = Math.PI / 18; // 10°
    }
    if (sclGizmo) {
      sclGizmo.updateGizmoPositionToMatchAttachedMesh = true;
      sclGizmo.snapDistance = 0.1;
    }

    // Arrow shaft thickness + pickable area.
    for (const g of [posGizmo, rotGizmo, sclGizmo]) {
      if (g) {
        g.updateScale = true;
        (g as any).sensitivity = 1.0;
      }
    }

    // Capture the state of the mesh the gizmo is ACTUALLY attached to. Using
    // `this.selected` blindly let a stale selection poison the scale fold.
    const onGizmoDragStart = (mode: 'translate' | 'rotate' | 'scale') => {
      const attached = this.gizmoManager.attachedMesh;
      const target = this.instances.find((i) => i.mesh === attached) ?? this.selected;
      if (!target) return;
      this.dragTarget = target;
      this.dragMode = mode;
      this.dragStartScale = [...target.props.scale];
      const s = (target.mesh as BABYLON.Mesh).scaling;
      this.dragStartMeshScale = [s.x, s.y, s.z];
    };
    // Keep the Rapier collider and hitbox wireframe glued to the mesh *while*
    // dragging, not just when the drag ends. Otherwise the object visually
    // moves through walls because its collision is still at the old spot.
    const onGizmoDrag = () => this.syncBodyToMesh();
    // On release, fold the final transform into the component data and do one
    // clean rebuild so the collider shape exactly matches the new size.
    const onGizmoDragEnd = () => {
      const target = this.dragTarget ?? this.selected;
      if (!target) return;
      const m = target.mesh as BABYLON.Mesh;
      target.props.position = [m.position.x, m.position.y, m.position.z];
      target.props.rotation = [m.rotation.x, m.rotation.y, m.rotation.z];
      // Spawn markers use facing (not rotation) as their meaningful yaw —
      // persist a gizmo rotation so the arrow keeps pointing where you put it.
      if (target.type === 'playerSpawn' || target.type === 'enemySpawn') {
        target.props.facing = Math.round((m.rotation.y * 180 / Math.PI) * 10) / 10;
      }
      // Moving/rotating must never change size. Only the scale gizmo folds
      // its delta into props.scale.
      target.props.scale = this.dragMode === 'scale'
        ? this.draggedScale(m)
        : [...this.dragStartScale];
      this.dragTarget = null;
      this.dragMode = null;
      this.rebuild(target);
      this.hl.removeAllMeshes();
      this.hl.addMesh(target.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
      this.refreshInspector();
    };
    // Babylon exposes the drag observables on the gizmo interfaces, not on
    // the base Gizmo class, so keep this structurally typed.
    const wireGizmo = (
      g: {
        onDragStartObservable?: BABYLON.Observable<any>;
        onDragObservable?: BABYLON.Observable<any>;
        onDragEndObservable: BABYLON.Observable<any>;
      } | null | undefined,
      mode: 'translate' | 'rotate' | 'scale',
    ) => {
      if (!g) return;
      g.onDragStartObservable?.add(() => onGizmoDragStart(mode));
      g.onDragObservable?.add(onGizmoDrag);
      g.onDragEndObservable.add(onGizmoDragEnd);
    };
    wireGizmo(posGizmo, 'translate');
    wireGizmo(rotGizmo, 'rotate');
    wireGizmo(sclGizmo, 'scale');

    // Reference floor grid.
    const grid = BABYLON.MeshBuilder.CreateGround('editor-grid', { width: 200, height: 200 }, this.scene);
    const gridMat = new BABYLON.StandardMaterial('grid-mat', this.scene);
    gridMat.diffuseColor = new BABYLON.Color3(0.16, 0.2, 0.26);
    gridMat.backFaceCulling = false;
    grid.material = gridMat;
    grid.receiveShadows = true;

    const gridBody = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.physics.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), gridBody);

    // Starter floor under the default spawn so clicking Play works immediately.
    const starterProps: ComponentProps = {
      id: 'starter-floor',
      type: 'floor',
      position: [0, -0.25, 0],
      rotation: [0, 0, 0],
      scale: [16, 0.5, 16],
      collide: true,
    };
    const starter = this.registry.build(this.scene, this.physics, this.materials, starterProps, this.shadowGen);
    const floorMesh = starter.meshes[0];
    const starterInstance: Instance = { id: 'starter-floor', type: 'floor', props: starterProps, mesh: floorMesh, body: starter.body };
    this.syncHitbox(starterInstance);
    this.instances.push(starterInstance);
    this.select(this.instances[0]);
    this.counters.set('floor', 1);

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this.updateCamera();
      this.updateKeyboardCamera(dt);
      // Drive the collider + wireframe straight from the mesh every frame
      // while a gizmo is being dragged. This does not rely on gizmo event
      // ordering and keeps the hitbox visually glued to the object.
      if (this.gizmoDragging) this.syncBodyToMesh();
      this.scene.render();
    });

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', () => this.onPointerUp());
    this.canvas.addEventListener('pointerleave', () => this.onPointerUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Ensure keyboard events work: focus the window when canvas is clicked.
    this.canvas.addEventListener('click', () => {
      window.focus();
      this.canvas.focus();
    });

    // WASD/QE navigation of the viewport, Unity style.
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      // Mirror the input-field check for consistency (no-op if key not in set).
      const target = e.target as HTMLElement | null;
      if (!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'))) {
        this.keys.delete(e.code);
      }
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Track a key press unless the user is typing in a field. */
  private onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    // Duplicate the selected piece without polluting the WASD key state.
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
      e.preventDefault();
      this.duplicateSelected();
      return;
    }
    this.keys.add(e.code);
    // Gizmo mode hotkeys: 1=translate, 2=rotate, 3=scale.
    if (e.code === 'Digit1') {
      e.preventDefault();
      this.setGizmoMode('translate');
    } else if (e.code === 'Digit2') {
      e.preventDefault();
      this.setGizmoMode('rotate');
    } else if (e.code === 'Digit3') {
      e.preventDefault();
      this.setGizmoMode('scale');
    } else if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF'].includes(e.code)) {
      e.preventDefault();
    }
  }

  /**
   * Ground-plane forward / right vectors derived from Babylon's ArcRotateCamera
   * position formula (camera.pure.js):
   *   offset = (r·cosα·sinβ, r·cosβ, r·sinα·sinβ)
   * so the view direction (camera → target) on the ground is
   *   forward = (-cosα, 0, -sinα)
   *
   * Babylon is LEFT-handed, so screen-right is cross(UP, forward), NOT
   * cross(forward, UP). Verified against camera.getDirection(Axis.X):
   * at α=0 forward = (-1,0,0) and right = (0,0,+1).
   */
  private groundBasis() {
    const forward = new BABYLON.Vector3(
      -Math.cos(this.alpha),
      0,
      -Math.sin(this.alpha),
    );
    const right = new BABYLON.Vector3(
      forward.z,
      0,
      -forward.x,
    );
    return { forward, right };
  }

  private updateKeyboardCamera(dt: number) {
    if (this.keys.size === 0) return;
    const speed = Math.max(2, this.radius * 0.6) * dt;
    const { forward, right } = this.groundBasis();

    const move = BABYLON.Vector3.Zero();
    if (this.keys.has('KeyW')) move.addInPlace(forward.scale(1));
    if (this.keys.has('KeyS')) move.addInPlace(forward.scale(-1));
    if (this.keys.has('KeyD')) move.addInPlace(right.scale(1));
    if (this.keys.has('KeyA')) move.addInPlace(right.scale(-1));
    if (this.keys.has('KeyE') || this.keys.has('KeyR')) move.y += 1;
    if (this.keys.has('KeyQ') || this.keys.has('KeyF')) move.y -= 1;

    if (move.lengthSquared() === 0) return;
    move.normalize().scaleInPlace(speed);
    this.target.addInPlace(move);
  }

  private updateCamera() {
    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.radius;
    this.camera.setTarget(this.target);
  }

  // ------------------------------------------------------------------ input

  /** Convert page pointer coords to canvas-relative coords for picking. */
  private canvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** True if a Babylon gizmo is currently being dragged. */
  private get gizmoDragging(): boolean {
    return this.gizmoManager?.isDragging ?? false;
  }

  /** True if mouse is over a gizmo handle. */
  private get gizmoHovered(): boolean {
    return this.gizmoManager?.isHovered ?? false;
  }

  private onPointerDown(e: PointerEvent) {
    // Let gizmos eat the event first.
    if (this.gizmoDragging || this.gizmoHovered) return;

    this.pointerDown = true;
    this.dragButton = e.button;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (e.button === 2) {
      // Right-click: pan only, no context menu.
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      const { x, y } = this.canvasCoords(e);
      const pickResult = this.scene.pick(x, y, (mesh) => {
        return this.instances.some((i) => i.mesh === mesh);
      }, false, this.camera);

      if (pickResult.hit && pickResult.pickedMesh) {
        const instance = this.instances.find((i) => i.mesh === pickResult.pickedMesh!);
        if (instance) {
          if (instance === this.selected) {
            // Clicked the already-selected object again: start dragging it (legacy fallback).
            this.dragObject = true;
          } else {
            // Clicked a different object: select it instead of dragging.
            this.select(instance);
            this.dragObject = false;
          }
        }
      } else {
        // Clicked empty space: deselect.
        this.select(null);
        this.dragObject = false;
      }
    }
  }

  private onPointerMove(e: PointerEvent) {
    // Don't fight the gizmo.
    if (this.gizmoDragging || this.gizmoHovered) return;

    // Compute the delta from the PREVIOUS pointer position BEFORE overwriting
    // lastPointer. (Doing it the other way round makes dx/dy always zero, so
    // panning and orbiting silently do nothing.)
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (!this.pointerDown) return;

    if (this.dragButton === 2) {
      // Right-drag: pan camera.
      this.panCamera(dx, dy);
      return;
    }

    if (this.dragButton === 0 && this.dragObject && this.selected) {
      // Legacy left-drag move (when no gizmo mode active).
      this.dragSelected(e);
    } else if (this.dragButton === 0 && !this.dragObject) {
      // Left-drag on empty space: orbit camera.
      this.orbitCamera(dx, dy);
    }
  }

  private onPointerUp() {
    this.pointerDown = false;
    this.dragButton = -1;
    this.dragObject = false;
  }

  /** Pan the camera target (right-drag). */
  private panCamera(dx: number, dy: number) {
    const cam = this.camera;
    const forward = cam.getForwardRay().direction;
    forward.y = 0;
    forward.normalize();
    // Left-handed: screen-right is cross(UP, forward), not the other way round.
    const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), forward);
    right.normalize();
    const up = BABYLON.Vector3.Up();
    const speed = 0.005 * this.radius;
    const pan = right.scale(dx * speed).add(up.scale(-dy * speed));
    this.target.addInPlace(pan);
  }

  /** Orbit the camera around the target (left-drag on empty space). */
  private orbitCamera(dx: number, dy: number) {
    this.alpha -= dx * 0.004;
    this.beta = Math.min(Math.max(this.beta - dy * 0.004, 0.05), 1.45);
  }

  /** Legacy drag: move selected object on its current height plane. */
  private dragSelected(e: PointerEvent) {
    const selected = this.selected;
    if (!selected) return;
    const { x, y } = this.canvasCoords(e);
    const ray = this.scene.createPickingRay(x, y, BABYLON.Matrix.Identity(), this.camera);
    const plane = BABYLON.Plane.FromPositionAndNormal(
      new BABYLON.Vector3(0, selected.props.position[1], 0),
      BABYLON.Vector3.Up(),
    );
    const dist = ray.intersectsPlane(plane);
    if (dist === null) return;
    const point = ray.origin.add(ray.direction.scale(dist));
    const p = selected.props.position;
    p[0] = point.x;
    p[2] = point.z;
    selected.mesh.position.x = point.x;
    selected.mesh.position.z = point.z;
    if (selected.body) {
      selected.body.setTranslation({ x: point.x, y: p[1], z: point.z }, true);
    }
    if (selected.hitbox) {
      selected.hitbox.position.x = point.x;
      selected.hitbox.position.z = point.z;
    }
    this.refreshInspector();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.91;
    this.radius = Math.min(Math.max(this.radius * delta, 5), 90);
  }

  private pickAt(x: number, y: number) {
    const pickResult = this.scene.pick(x, y, (mesh) => {
      return this.instances.some((i) => i.mesh === mesh);
    }, false, this.camera);
    if (pickResult.hit && pickResult.pickedMesh) {
      const instance = this.instances.find((i) => i.mesh === pickResult.pickedMesh!);
      if (instance) this.select(instance);
    } else {
      this.select(null);
    }
  }

  // ------------------------------------------------------------------ scene

  private select(instance: Instance | null) {
    this.selected = instance;
    this.dragTarget = null;
    this.dragMode = null;
    this.hl.removeAllMeshes();
    if (instance) {
      this.hl.addMesh(instance.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
      this.target.copyFrom(instance.mesh.position);
      this.target.y = Math.max(this.target.y, instance.mesh.position.y + 2);
      // Attach gizmo to the new selection (in current mode).
      this.updateGizmoAttachment();
    } else {
      this.detachGizmo();
    }
    this.refreshInspector();
  }

  /** Set the active gizmo mode and update button states. */
  private setGizmoMode(mode: 'translate' | 'rotate' | 'scale' | null) {
    this.gizmoMode = mode;
    this.updateGizmoButtons();
    this.updateGizmoAttachment();
  }

  private updateGizmoButtons() {
    const buttons = [this.elGizmoMove, this.elGizmoRotate, this.elGizmoScale];
    const modes: Array<'translate' | 'rotate' | 'scale'> = ['translate', 'rotate', 'scale'];
    buttons.forEach((btn, i) => {
      if (modes[i] === this.gizmoMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /** Attach/detach the gizmo to the currently selected instance. */
  private updateGizmoAttachment() {
    if (!this.selected || !this.gizmoMode) {
      this.detachGizmo();
      return;
    }
    const mesh = this.selected.mesh as BABYLON.Mesh;
    // Enable the correct gizmo, disable the others.
    this.gizmoManager.positionGizmoEnabled = this.gizmoMode === 'translate';
    this.gizmoManager.rotationGizmoEnabled = this.gizmoMode === 'rotate';
    this.gizmoManager.scaleGizmoEnabled = this.gizmoMode === 'scale';
    // Attach to the selected mesh.
    this.gizmoManager.attachToMesh(mesh);
  }

  private detachGizmo() {
    this.gizmoManager.positionGizmoEnabled = false;
    this.gizmoManager.rotationGizmoEnabled = false;
    this.gizmoManager.scaleGizmoEnabled = false;
    this.gizmoManager.attachToMesh(null);
  }

  private addComponent(type: ComponentType) {
    const def = this.registry.get(type);
    if (!def) return;
    const count = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, count);
    const id = `${type}-${count}`;
    const [dx, dy, dz] = def.defaultScale;
    // Place floors with their top surface at y=0 (matches the hand-authored
    // first level, where the player capsule bottom at ~0.005 clears it).
    // Everything else sits with its bottom on the ground (y=0).
    // Components stack going -Z so they never overlap the default spawn at origin.
    const isFloor = type === 'floor' || type.endsWith('_floor') || type === 'grate_floor' || type === 'asphalt' || type === 'rooftop_gravel';
    const posY = type === 'playerSpawn' ? 0.92 : (isFloor ? -dy / 2 : dy / 2);
    const props: ComponentProps = {
      id,
      type,
      position: [0, posY, -8 - (count - 1) * 2],
      rotation: [0, 0, 0],
      scale: [dx, dy, dz],
      collide: true,
    };
    // The wall-run panel is a parkour surface by default.
    if (type === 'wallrun_panel') props.wallRun = true;
    const result = this.registry.build(this.scene, this.physics, this.materials, props, this.shadowGen);
    const mesh = result.meshes[0];
    const instance: Instance = { id, type, props, mesh, body: result.body };
    this.syncHitbox(instance);
    this.instances.push(instance);
    this.select(instance);
    this.setStatus(`Added ${def.label}`);
  }

  /**
   * Refresh the lime wireframe that visualises the real Rapier collider of
   * an instance. It is rebuilt from the collider's own half-extents so it
   * always matches the hitbox exactly, even for plates and ramps whose
   * thickness differs from the object scale.
   */
  private syncHitbox(instance: Instance) {
    instance.hitbox?.dispose();
    instance.hitbox = undefined;
    if (!instance.body) return;

    let hx = instance.props.scale[0] / 2;
    let hy = instance.props.scale[1] / 2;
    let hz = instance.props.scale[2] / 2;
    // Ramps bake their slope into the collider quaternion while props.rotation
    // stays (0,0,0), so read the ORIENTATION from the collider too — otherwise
    // the wireframe shows a flat box where the real collider is sloped.
    let rx = instance.props.rotation[0];
    let ry = instance.props.rotation[1];
    let rz = instance.props.rotation[2];
    try {
      const collider = instance.body.collider(0);
      const he = collider.halfExtents();
      if (he) {
        hx = he.x; hy = he.y; hz = he.z;
        // Remember the base extents + scale so a live gizmo scale drag can
        // resize the collider proportionally (works for plates/ramps too).
        instance.baseHalfExtents = { x: he.x, y: he.y, z: he.z };
        instance.baseScale = [...instance.props.scale] as [number, number, number];
      }
      const cq = collider.rotation();
      if (cq) {
        const e = new BABYLON.Quaternion(cq.x, cq.y, cq.z, cq.w).toEulerAngles();
        rx = e.x; ry = e.y; rz = e.z;
      }
    } catch { /* fall back to props */ }

    const box = BABYLON.MeshBuilder.CreateBox(`hitbox-${instance.id}`, {
      width: hx * 2, height: hy * 2, depth: hz * 2,
    }, this.scene);
    box.position.copyFrom(new BABYLON.Vector3(
      instance.props.position[0],
      instance.props.position[1],
      instance.props.position[2],
    ));
    box.rotation.set(rx, ry, rz);
    const mat = new BABYLON.StandardMaterial(`hitbox-mat-${instance.id}`, this.scene);
    // Parkour triggers are cyan, ordinary colliders are lime.
    const tagged = instance.props.wallRun === true;
    mat.emissiveColor = tagged
      ? new BABYLON.Color3(0.2, 0.85, 1)
      : new BABYLON.Color3(0.15, 1, 0.25);
    mat.wireframe = true;
    mat.disableLighting = true;
    box.material = mat;
    box.isPickable = false;
    instance.hitbox = box;
  }

  /**
   * Absolute scale represented by the gizmo right now.
   *
   * Babylon's scale gizmo multiplies the mesh's CURRENT scaling. Some meshes
   * (grapple rings) are built with `scaling = props.scale`, and a stale drag
   * can leave a mesh scaled too, so multiplying `props.scale * mesh.scaling`
   * would square the size on every drag — eventually turning a plate into a
   * cube. Always measure the gizmo's DELTA against the scaling at drag start.
   */
  private draggedScale(m: BABYLON.Mesh): [number, number, number] {
    const base = this.dragStartScale;
    const meshBase = this.dragStartMeshScale;
    const factor = (k: number, current: number) => {
      const from = Math.abs(meshBase[k]) > 1e-6 ? meshBase[k] : 1;
      return Math.max(0.01, base[k] * current / from);
    };
    return [factor(0, m.scaling.x), factor(1, m.scaling.y), factor(2, m.scaling.z)];
  }

  /**
   * Live-follow the mesh during a gizmo drag. Translation and rotation only
   * touch position/orientation; the size is left completely alone unless the
   * scale gizmo is what is being dragged. This is what used to turn a wall
   * into a tiny cube when you moved it.
   */
  private syncBodyToMesh() {
    const i = this.dragTarget ?? this.selected;
    if (!i) return;
    const m = i.mesh as BABYLON.Mesh;
    const p = m.position;
    const r = m.rotation;
    const scalingDrag = this.dragMode === 'scale';
    const rotationDrag = this.dragMode === 'rotate';

    i.props.position = [p.x, p.y, p.z];
    i.props.rotation = [r.x, r.y, r.z];
    if (scalingDrag) i.props.scale = this.draggedScale(m);

    if (i.body) {
      i.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      const collider = i.body.collider(0);
      if (collider) {
        if (rotationDrag) {
          // Fixed bodies keep an identity rotation; the collider carries it.
          const q = BABYLON.Quaternion.RotationYawPitchRoll(r.y, r.x, r.z);
          collider.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        }
        const base = i.baseHalfExtents;
        const bs = i.baseScale;
        if (scalingDrag && base && bs) {
          collider.setHalfExtents({
            x: Math.max(0.01, base.x * i.props.scale[0] / bs[0]),
            y: Math.max(0.01, base.y * i.props.scale[1] / bs[1]),
            z: Math.max(0.01, base.z * i.props.scale[2] / bs[2]),
          });
        }
      }
    }

    if (i.hitbox) {
      i.hitbox.position.set(p.x, p.y, p.z);
      if (rotationDrag) i.hitbox.rotation.set(r.x, r.y, r.z);
      if (scalingDrag && i.baseHalfExtents && i.baseScale) {
        i.hitbox.scaling.set(
          i.props.scale[0] / i.baseScale[0],
          i.props.scale[1] / i.baseScale[1],
          i.props.scale[2] / i.baseScale[2],
        );
      }
    }
  }

  private rebuild(instance: Instance) {
    instance.mesh.dispose();
    if (instance.body) {
      this.physics.removeRigidBody(instance.body);
    }
    const result = this.registry.build(this.scene, this.physics, this.materials, instance.props, this.shadowGen);
    instance.mesh = result.meshes[0];
    instance.body = result.body;
    this.syncHitbox(instance);
    if (this.selected === instance) {
      this.hl.addMesh(instance.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
      // CRITICAL: the old mesh was disposed, so the gizmo is still attached to
      // a dead object. Re-attach it or the next drag moves nothing (and the
      // wireframe appears frozen).
      this.updateGizmoAttachment();
    }
  }

  private deleteSelected() {
    if (!this.selected) return;
    this.selected.mesh.dispose();
    this.selected.hitbox?.dispose();
    if (this.selected.body) this.physics.removeRigidBody(this.selected.body);
    this.instances = this.instances.filter((i) => i !== this.selected);
    this.select(null);
    this.setStatus('Deleted component');
  }

  /** Copy the selected component with all of its properties, placed beside it. */
  private duplicateSelected() {
    const source = this.selected;
    if (!source) {
      this.setStatus('Select a component to duplicate');
      return;
    }
    const props = JSON.parse(JSON.stringify(source.props)) as ComponentProps;
    let count = this.counters.get(source.type) ?? 0;
    do {
      count += 1;
      props.id = `${source.type}-${count}`;
    } while (this.instances.some((i) => i.id === props.id));
    this.counters.set(source.type, count);

    // Step one full width along world X so the copy sits next to the original
    // instead of inside it (and inherits every material/tag/facing/scale).
    props.position = [
      props.position[0] + Math.max(1, props.scale[0]),
      props.position[1],
      props.position[2],
    ];

    const result = this.registry.build(this.scene, this.physics, this.materials, props, this.shadowGen);
    const copy: Instance = {
      id: props.id,
      type: props.type,
      props,
      mesh: result.meshes[0],
      body: result.body,
    };
    this.syncHitbox(copy);
    this.instances.push(copy);
    this.select(copy);
    this.setStatus(`Duplicated ${source.type} → ${props.id}`);
  }

  // ------------------------------------------------------------------ inspector

  private refreshInspector() {
    this.elInspector.innerHTML = '';
    if (!this.selected) {
      this.elInspector.appendChild(this.emptyNode());
      return;
    }
    const i = this.selected;

    this.elInspector.appendChild(this.h3('Inspector'));
    this.elInspector.appendChild(this.field('ID', 'text', i.id, false, (v) => (i.props.id = v)));
    this.elInspector.appendChild(this.readonly('Type', i.type));
    this.elInspector.appendChild(this.readonly('Material', i.props.material ?? '(plain)'));

    const vec3 = (label: string, attr: 'position' | 'rotation' | 'scale') => {
      const node = document.createElement('div');
      node.className = 'field';
      const h3 = document.createElement('h3');
      h3.textContent = label;
      node.appendChild(h3);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      ['x', 'y', 'z'].forEach((axis, k) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = String(i.props[attr][k]);
        input.addEventListener('input', () => {
          const n = parseFloat(input.value);
          if (!Number.isNaN(n)) {
            i.props[attr][k] = n;
            this.rebuild(i);
            if (this.selected === i) {
              this.hl.removeMesh(i.mesh as BABYLON.Mesh);
              this.hl.addMesh(i.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
            }
          }
        });
        input.style.width = '56px';
        row.appendChild(input);
      });
      node.appendChild(row);
      return node;
    };

    this.elInspector.appendChild(vec3('Position', 'position'));
    this.elInspector.appendChild(vec3('Rotation', 'rotation'));
    this.elInspector.appendChild(vec3('Scale', 'scale'));

    // --- Spawn facing ------------------------------------------------------
    if (i.type === 'playerSpawn' || i.type === 'enemySpawn') {
      this.elInspector.appendChild(this.h3('Spawn Facing'));
      const faceField = document.createElement('div');
      faceField.className = 'field';
      const faceLabel = document.createElement('label');
      faceLabel.textContent = 'Degrees (0 = +Z, 90 = +X)';
      faceField.appendChild(faceLabel);
      const faceInput = document.createElement('input');
      faceInput.type = 'number';
      faceInput.step = '5';
      faceInput.value = String(i.props.facing ?? 0);
      faceInput.addEventListener('input', () => {
        const deg = parseFloat(faceInput.value);
        if (!Number.isNaN(deg)) {
          i.props.facing = deg;
          this.rebuild(i);
          this.refreshInspector();
        }
      });
      faceField.appendChild(faceInput);
      this.elInspector.appendChild(faceField);
    }

    // --- Material dropdown (no typing required) ---
    const TEXTURES = [
      '(plain)',
      'concrete_wall', 'concrete_floor', 'cracked_concrete', 'brick_wall',
      'corrugated_metal', 'rusted_metal', 'scratched_metal', 'graffiti',
      'plastic_crate', 'cardboard_box', 'wooden_crate', 'barrel', 'dumpster',
      'trash_bag', 'sign_blank', 'sign_neon', 'poster', 'air_vent', 'duct_metal',
      'pipe_metal', 'window_lit', 'window_dark', 'billboard_ads', 'circuit_board',
      'server_rack', 'chainlink', 'mesh_fence', 'caution_stripe', 'scaffolding',
      'cable_bundle',
    ];

    const matField = document.createElement('div');
    matField.className = 'field';
    const matLabel = document.createElement('label');
    matLabel.textContent = 'Material / Texture';
    matField.appendChild(matLabel);
    const matSelect = document.createElement('select');
    matSelect.style.width = '100%';
    matSelect.style.padding = '5px 8px';
    matSelect.style.background = '#0b0f16';
    matSelect.style.border = '1px solid #33465c';
    matSelect.style.color = '#e8edf5';
    matSelect.style.borderRadius = '3px';
    matSelect.style.fontSize = '12px';
    const current = i.props.material ?? '(plain)';
    for (const name of TEXTURES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name === '(plain)' ? '(plain / no texture)' : name;
      opt.selected = name === current;
      matSelect.appendChild(opt);
    }
    matSelect.addEventListener('change', () => {
      const val = matSelect.value;
      i.props.material = val === '(plain)' ? undefined : val;
      this.rebuild(i);
      this.refreshInspector();
      this.select(i);
    });
    matField.appendChild(matSelect);
    this.elInspector.appendChild(matField);

    const collide = document.createElement('div');
    collide.className = 'field check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = i.props.collide !== false;
    cb.addEventListener('change', () => {
      i.props.collide = cb.checked;
      this.rebuild(i);
    });
    collide.appendChild(cb);
    const cbl = document.createElement('label');
    cbl.textContent = 'Collidable';
    collide.appendChild(cbl);
    this.elInspector.appendChild(collide);

    // --- Parkour trigger: wall-run -----------------------------------------
    const wallRunField = document.createElement('div');
    wallRunField.className = 'field check';
    const wrCb = document.createElement('input');
    wrCb.type = 'checkbox';
    const isWallrunPanel = i.type === 'wallrun_panel';
    wrCb.checked = i.props.wallRun ?? isWallrunPanel;
    wrCb.addEventListener('change', () => {
      i.props.wallRun = wrCb.checked;
      this.rebuild(i);
      this.setStatus(wrCb.checked
        ? 'Wall-run enabled on this surface'
        : 'Wall-run disabled on this surface');
    });
    wallRunField.appendChild(wrCb);
    const wrLabel = document.createElement('label');
    wrLabel.textContent = 'Wall-run (parkour trigger)';
    wallRunField.appendChild(wrLabel);
    this.elInspector.appendChild(wallRunField);

    // --- Parkour trigger: mantle -------------------------------------------
    const mantleField = document.createElement('div');
    mantleField.className = 'field check';
    const mCb = document.createElement('input');
    mCb.type = 'checkbox';
    mCb.checked = i.props.mantle === true;
    mCb.addEventListener('change', () => {
      i.props.mantle = mCb.checked;
      this.rebuild(i);
    });
    mantleField.appendChild(mCb);
    const mLabel = document.createElement('label');
    mLabel.textContent = 'Mantle (ledge grab)';
    mantleField.appendChild(mLabel);
    this.elInspector.appendChild(mantleField);

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', () => this.deleteSelected());
    this.elInspector.appendChild(del);
  }

  private emptyNode() {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Select a component to edit it.';
    return div;
  }

  private h3(text: string) {
    const el = document.createElement('h3');
    el.textContent = text;
    return el;
  }

  private field(label: string, type: string, value: string, readonly: boolean, onChange: (v: string) => void) {
    const node = document.createElement('div');
    node.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    node.appendChild(lab);
    const input = document.createElement('input');
    input.type = type;
    input.readOnly = readonly;
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    node.appendChild(input);
    return node;
  }

  private readonly(label: string, value: string) {
    return this.field(label, 'text', value, true, () => {});
  }

  // ------------------------------------------------------------------ palette

  private buildPalette() {
    this.elPalette.innerHTML = '';
    const byCategory = new Map<string, ComponentDef[]>();
    for (const def of this.registry.types()) {
      const list = byCategory.get(def.category) ?? [];
      list.push(def);
      byCategory.set(def.category, list);
    }

    const orderedCategories = ['Geometry', 'Walls', 'Floors', 'Props', 'Fixtures', 'Signs', 'Fences', 'Markers'];
    const allCategories = [...orderedCategories, ...Array.from(byCategory.keys()).filter((c) => !orderedCategories.includes(c))];

    for (const category of allCategories) {
      const list = byCategory.get(category)!;
      const section = document.createElement('div');
      section.className = 'palette-section';
      const title = document.createElement('div');
      title.className = 'palette-section-title';
      title.textContent = category;
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'palette-grid';
      for (const def of list) {
        const btn = document.createElement('button');
        btn.className = 'palette-btn';
        btn.innerHTML = `<div class="label">${def.label}</div><div class="kind">${def.type}</div>`;
        btn.addEventListener('click', () => this.addComponent(def.type));
        grid.appendChild(btn);
      }
      section.appendChild(grid);
      this.elPalette.appendChild(section);
    }
  }

  // ------------------------------------------------------------------ level data

  private newLevel() {
    for (const inst of this.instances) {
      inst.mesh.dispose();
      inst.hitbox?.dispose();
      if (inst.body) this.physics.removeRigidBody(inst.body);
    }
    this.instances = [];
    this.counters.clear();
    this.dragTarget = null;
    this.dragMode = null;
    this.select(null);
    this.elLevelName.value = 'untitled';
    this.setStatus('New level');
  }

  private saveLevel() {
    const name = this.elLevelName.value || 'untitled';
    localStorage.setItem(`velocity-level-${name}`, JSON.stringify(this.serialize(), null, 2));
    this.setStatus(`Saved "${name}" to local storage`);
  }

  /**
   * Forget the browser copy. The game prefers `/src/world/levels/<name>.json`
   * and only falls back to localStorage, so a stale browser save can keep an
   * old version alive even after the disk file was moved or deleted.
   */
  private deleteSavedLevel() {
    const name = this.elLevelName.value || 'untitled';
    localStorage.removeItem(`velocity-level-${name}`);
    this.setStatus(`Deleted browser save "${name}"`);
  }

  private loadLevel() {
    const name = this.elLevelName.value || 'untitled';
    const raw = localStorage.getItem(`velocity-level-${name}`);
    if (!raw) {
      this.setStatus(`No saved level "${name}"`);
      return;
    }
    try {
      const data = JSON.parse(raw) as LevelData;
      this.fromData(data);
      this.setStatus(`Loaded "${name}"`);
    } catch (e) {
      this.setStatus('Failed to load saved level');
      console.error(e);
    }
  }

  private fromData(data: LevelData) {
    this.newLevel();
    this.elLevelName.value = data.name;
    this.elWallRunStrict.checked = data.parkour?.wallRunStrict === true;
    this.elMantleStrict.checked = data.parkour?.mantleStrict === true;
    for (const props of data.components) {
      const instId = props.id;
      const result = this.registry.build(this.scene, this.physics, this.materials, props, this.shadowGen);
      const instance: Instance = {
        id: instId,
        type: props.type,
        props: JSON.parse(JSON.stringify(props)),
        mesh: result.meshes[0],
        body: result.body,
      };
      this.syncHitbox(instance);
      this.instances.push(instance);
      const count = (this.counters.get(props.type) ?? 0) + 1;
      this.counters.set(props.type, count);
    }
    // Markers are rendered as instances already (they're in components). Keep
    // them selectable; nothing else to do.
    if (this.instances.length) this.select(this.instances[0]);
  }

  private serialize(): LevelData {
    // Every placed instance (including markers) is exported as a component so
    // that the level round-trips through the editor 1:1. The game loader
    // reads spawn / anchor / enemy data from the component builds themselves.
    const playerSpawn = this.instances.find((i) => i.type === 'playerSpawn');
    const rawSpawn = playerSpawn
      ? [playerSpawn.props.position[0], playerSpawn.props.position[1], playerSpawn.props.position[2]]
      : [0, 0.92, 0];
    // Never spawn below standing height: if you place the spawn marker
    // underground the game still puts you on top of the floor.
    const spawn: [number, number, number] = [rawSpawn[0], Math.max(rawSpawn[1], 0.92), rawSpawn[2]];

    return {
      name: this.elLevelName.value || 'untitled',
      spawn,
      gameplaySpawn: spawn,
      killY: -6,
      components: this.instances.map((i) => JSON.parse(JSON.stringify(i.props))),
      grappleAnchors: [],
      enemySpawns: [],
      lights: [],
      parkour: {
        wallRunStrict: this.elWallRunStrict.checked,
        mantleStrict: this.elMantleStrict.checked,
      },
    };
  }

  private exportLevel() {
    const data = this.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.setStatus(`Exported ${data.name}.json`);
  }

  private copyLevel() {
    const json = JSON.stringify(this.serialize(), null, 2);
    navigator.clipboard.writeText(json).then(() => {
      this.setStatus('Level JSON copied to clipboard');
    });
  }

  private playLevel() {
    const name = this.elLevelName.value || 'untitled';
    // Persist so the game can load it via ?level=name (localStorage fallback).
    localStorage.setItem(`velocity-level-${name}`, JSON.stringify(this.serialize(), null, 2));
    this.exportLevel();
    this.setStatus(`Saved "${name}" — launching game...`);
    window.location.href = `/?level=${encodeURIComponent(name)}`;
  }

  /** Called by `newLevel` before wiping; exposed for tests. */
  dispose() {
    for (const inst of this.instances) {
      inst.mesh.dispose();
      if (inst.body) this.physics.removeRigidBody(inst.body);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Editor();
});
