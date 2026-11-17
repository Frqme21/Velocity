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

interface Instance {
  id: string;
  type: ComponentType;
  props: ComponentProps;
  mesh: BABYLON.AbstractMesh;
  body?: RAPIER.RigidBody;
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

  private instances: Instance[] = [];
  private selected: Instance | null = null;
  private counters = new Map<string, number>();

  // UI
  private readonly elLevelName: HTMLInputElement;
  private readonly elStatus: HTMLElement;
  private readonly elPalette: HTMLElement;
  private readonly elInspector: HTMLElement;

  // Input / camera
  private pointerDown = false;
  private dragObject = false;
  private lastPointer = { x: 0, y: 0 };
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
    document.getElementById('btn-export')!.addEventListener('click', () => this.exportLevel());
    document.getElementById('btn-copy')!.addEventListener('click', () => this.copyLevel());
    document.getElementById('btn-play')!.addEventListener('click', () => this.playLevel());
    this.elLevelName.addEventListener('change', () => this.setStatus('Level renamed'));

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

    // Reference floor grid.
    const grid = BABYLON.MeshBuilder.CreateGround('editor-grid', { width: 200, height: 200 }, this.scene);
    const gridMat = new BABYLON.StandardMaterial('grid-mat', this.scene);
    gridMat.diffuseColor = new BABYLON.Color3(0.16, 0.2, 0.26);
    gridMat.backFaceCulling = false;
    grid.material = gridMat;
    grid.receiveShadows = true;

    const gridBody = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.physics.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), gridBody);

    this.engine.runRenderLoop(() => {
      this.updateCamera();
      this.scene.render();
    });

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', () => this.onPointerUp());
    this.canvas.addEventListener('pointerleave', () => this.onPointerUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private updateCamera() {
    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.radius;
    this.camera.setTarget(this.target);
  }

  // ------------------------------------------------------------------ input

  private onPointerDown(e: PointerEvent) {
    this.pointerDown = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (e.button === 0) {
      if (this.selected) {
        this.dragObject = true;
      } else {
        this.pickAt(e.clientX, e.clientY);
      }
    }
  }

  private onPointerMove(e: PointerEvent) {
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (this.dragObject && this.selected && this.pointerDown) {
      this.moveSelectedOnPlane(e.clientX, e.clientY, this.selected.props.position[1]);
      return;
    }

    if (this.pointerDown) {
      if (e.button === 0) {
        // Orbit around target.
        this.alpha -= dx * 0.004;
        this.beta = Math.min(Math.max(this.beta - dy * 0.004, 0.05), 1.45);
      } else if (e.button === 2) {
        // Pan.
        const cam = this.camera;
        const forward = cam.getForwardRay().direction;
        forward.y = 0;
        forward.normalize();
        const right = BABYLON.Vector3.Cross(forward, BABYLON.Vector3.Up());
        right.normalize();
        const up = BABYLON.Vector3.Up();
        const pan = right.scale((dx * 0.01) * this.radius * 0.001).add(up.scale((-dy * 0.01) * this.radius * 0.001));
        this.target.addInPlace(pan);
      }
    }
  }

  private onPointerUp() {
    this.pointerDown = false;
    this.dragObject = false;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.91;
    this.radius = Math.min(Math.max(this.radius * delta, 5), 90);
  }

  private pickAt(x: number, y: number) {
    const pickResult = this.scene.pick(x, y, (mesh) => {
      return this.instances.some((i) => i.mesh === mesh);
    });
    if (pickResult.hit && pickResult.pickedMesh) {
      const instance = this.instances.find((i) => i.mesh === pickResult.pickedMesh!);
      if (instance) this.select(instance);
    } else {
      this.select(null);
    }
  }

  private moveSelectedOnPlane(x: number, y: number, height: number) {
    const selected = this.selected;
    if (!selected) return;
    const ray = this.scene.createPickingRay(x, y, BABYLON.Matrix.Identity(), this.camera);
    const plane = BABYLON.Plane.FromPositionAndNormal(
      new BABYLON.Vector3(0, height, 0),
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
    this.refreshInspector();
  }

  // ------------------------------------------------------------------ scene

  private select(instance: Instance | null) {
    this.selected = instance;
    this.hl.removeAllMeshes();
    if (instance) {
      this.hl.addMesh(instance.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
      this.target.copyFrom(instance.mesh.position);
      this.target.y = Math.max(this.target.y, instance.mesh.position.y + 2);
    }
    this.refreshInspector();
  }

  private addComponent(type: ComponentType) {
    const def = this.registry.get(type);
    if (!def) return;
    const count = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, count);
    const id = `${type}-${count}`;
    const [dx, dy, dz] = def.defaultScale;
    const props: ComponentProps = {
      id,
      type,
      position: [0, dy / 2 + 0.5, 8 + count * 2],
      rotation: [0, 0, 0],
      scale: [dx, dy, dz],
      collide: true,
    };
    const result = this.registry.build(this.scene, this.physics, this.materials, props, this.shadowGen);
    const mesh = result.meshes[0];
    const instance: Instance = { id, type, props, mesh, body: result.body };
    this.instances.push(instance);
    this.select(instance);
    this.setStatus(`Added ${def.label}`);
  }

  private rebuild(instance: Instance) {
    instance.mesh.dispose();
    if (instance.body) {
      this.physics.removeRigidBody(instance.body);
    }
    const result = this.registry.build(this.scene, this.physics, this.materials, instance.props, this.shadowGen);
    instance.mesh = result.meshes[0];
    instance.body = result.body;
    if (this.selected === instance) {
      this.hl.addMesh(instance.mesh as BABYLON.Mesh, BABYLON.Color3.FromHexString('#8fd5ff'));
    }
  }

  private deleteSelected() {
    if (!this.selected) return;
    this.selected.mesh.dispose();
    if (this.selected.body) this.physics.removeRigidBody(this.selected.body);
    this.instances = this.instances.filter((i) => i !== this.selected);
    this.select(null);
    this.setStatus('Deleted component');
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
        input.addEventListener('change', () => {
          const n = parseFloat(input.value);
          if (!Number.isNaN(n)) {
            i.props[attr][k] = n;
            this.rebuild(i);
            this.refreshInspector();
            this.select(i);
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

    const matField = document.createElement('div');
    matField.className = 'field';
    const matLabel = document.createElement('label');
    matLabel.textContent = 'Material';
    matField.appendChild(matLabel);
    const matInput = document.createElement('input');
    matInput.type = 'text';
    matInput.value = i.props.material ?? '';
    matInput.placeholder = 'texture filename (e.g. concrete_wall)';
    matInput.addEventListener('change', () => {
      i.props.material = matInput.value || undefined;
      this.rebuild(i);
      this.refreshInspector();
      this.select(i);
    });
    matField.appendChild(matInput);
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
      if (inst.body) this.physics.removeRigidBody(inst.body);
    }
    this.instances = [];
    this.counters.clear();
    this.select(null);
    this.elLevelName.value = 'untitled';
    this.setStatus('New level');
  }

  private saveLevel() {
    const name = this.elLevelName.value || 'untitled';
    localStorage.setItem(`velocity-level-${name}`, JSON.stringify(this.serialize(), null, 2));
    this.setStatus(`Saved "${name}" to local storage`);
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
    const spawn: [number, number, number] = playerSpawn
      ? [playerSpawn.props.position[0], playerSpawn.props.position[1], playerSpawn.props.position[2]]
      : [0, 0.92, 14.5];

    return {
      name: this.elLevelName.value || 'untitled',
      spawn,
      gameplaySpawn: spawn,
      killY: -6,
      components: this.instances.map((i) => JSON.parse(JSON.stringify(i.props))),
      grappleAnchors: [],
      enemySpawns: [],
      lights: [],
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
    // Also export first so the JSON file exists for the game to fetch.
    this.exportLevel();
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
