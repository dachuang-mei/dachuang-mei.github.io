// 奉城古城墙 3D 模型查看器
// 依赖本地 three.js（static/js/three/），无需联网 CDN
import * as THREE from './three/three.module.js';
import { GLTFLoader } from './three/GLTFLoader.js';
import { DRACOLoader } from './three/DRACOLoader.js';
import { FBXLoader } from './three/FBXLoader.js';
import { OBJLoader } from './three/OBJLoader.js';
import { OrbitControls } from './three/OrbitControls.js';
import { RoomEnvironment } from './three/RoomEnvironment.js';

const DRACO_PATH = new URL('./three/draco/', import.meta.url).href;

// 按扩展名选择加载器，返回 Promise<Object3D>
function loadModel(url, onProgress) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();

  if (ext === 'glb' || ext === 'gltf') {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_PATH);
      loader.setDRACOLoader(draco);
      loader.load(url, (gltf) => resolve(gltf.scene), onProgress, reject);
    });
  }
  if (ext === 'fbx') {
    return new Promise((resolve, reject) => {
      new FBXLoader().load(url, resolve, onProgress, reject);
    });
  }
  if (ext === 'obj') {
    return new Promise((resolve, reject) => {
      new OBJLoader().load(url, resolve, onProgress, reject);
    });
  }
  return Promise.reject(new Error('不支持的模型格式：.' + ext + '（支持 glb / gltf / fbx / obj）'));
}


function initViewer(root) {
  const canvasHost = root.querySelector('.mv-canvas');
  const statusEl = root.querySelector('.mv-status');
  const progressBar = root.querySelector('.mv-progress-bar');
  const modelUrl = root.dataset.model;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    statusEl.textContent = '当前浏览器不支持 WebGL，无法显示 3D 模型。';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 400;
  controls.maxPolarAngle = Math.PI * 0.495;

  // 灯光
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6);
  scene.add(hemi);
  // 兜底环境光，避免法线/材质异常时模型全黑
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.position.set(30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  fill.position.set(-40, 30, -30);
  scene.add(fill);

  // 地面
  const groundGeo = new THREE.PlaneGeometry(1200, 1200);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(400, 80, 0x4a5568, 0x333a44);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  let modelBox = null;
  let defaultCam = null;

  function setProgress(loaded, total) {
    if (!progressBar) return;
    if (total > 0) {
      const pct = Math.min(100, (loaded / total) * 100);
      progressBar.style.width = pct.toFixed(1) + '%';
    }
  }

  const isGltf = /\.(glb|gltf)$/i.test(modelUrl.split('?')[0]);

  loadModel(modelUrl, (evt) => {
    if (evt && evt.lengthComputable) setProgress(evt.loaded, evt.total);
  })
    .then((model) => {
      if (disposed) return;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (!m) return;
            // 部分 FBX/Revit 导出的模型面朝向不一致，统一双面渲染避免整片被剔除
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          });
        }
      });
      modelGroup.add(model);

      // 自动缩放 + 居中（先缩放，再按缩放后的包围盒重新居中，避免偏移）
      let meshCount = 0;
      model.traverse((o) => {
        if (o.isMesh) meshCount++;
      });
      const box = new THREE.Box3().setFromObject(model);
      if (!meshCount || box.isEmpty()) {
        throw new Error('模型中没有可显示的几何体（mesh=0 或包围盒为空）');
      }
      const rawSize = new THREE.Vector3();
      box.getSize(rawSize);
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
      const scale = 40 / maxDim;
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);

      // 缩放后重新计算包围盒并居中
      const box2 = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box2.getSize(size);
      box2.getCenter(center);
      model.position.sub(center);
      model.position.y += size.y / 2; // 底部落在 y=0 地面
      model.updateMatrixWorld(true);

      const radius = Math.max(30, Math.hypot(size.x, size.y, size.z) * 1.1);
      const targetY = Math.max(2, size.y * 0.5);
      defaultCam = {
        pos: new THREE.Vector3(radius * 0.85, radius * 0.55, radius * 0.85),
        target: new THREE.Vector3(0, targetY, 0),
      };
      camera.position.copy(defaultCam.pos);
      controls.target.copy(defaultCam.target);
      controls.update();

      sun.target.position.set(0, targetY, 0);
      scene.add(sun.target);

      statusEl.classList.add('mv-hidden');

      // 调试信息（排查"加载成功但看不见"用）
      const hint = root.querySelector('.mv-hint');
      if (hint && (root.dataset.mvDebug === '1' || window.location.search.includes('debug'))) {
        hint.textContent =
          'mesh=' + meshCount +
          ' bbox=' + size.x.toFixed(2) + '×' + size.y.toFixed(2) + '×' + size.z.toFixed(2) +
          ' scale=' + scale.toFixed(3) +
          ' canvas=' + canvasHost.clientWidth + '×' + canvasHost.clientHeight +
          ' cam=' + camera.position.toArray().map((v) => v.toFixed(1)).join(',') +
          ' target=' + controls.target.toArray().map((v) => v.toFixed(1)).join(',');
        statsPending = true;
      }
    })
    .catch((err) => {
      if (disposed) return;
      console.error(err);
      statusEl.classList.remove('mv-hidden');
      statusEl.innerHTML =
        '模型加载失败：' + (err && err.message ? err.message : '') +
        '<br><small>请确认 <code>' + modelUrl + '</code> 是否存在。</small>';
      if (progressBar) progressBar.style.width = '0%';
    });


  // 尺寸自适应
  let disposed = false;
  function resize() {
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  // 渲染循环
  let statsPending = false;
  const debugOn = () => root.dataset.mvDebug === '1' || window.location.search.includes('debug');
  renderer.setAnimationLoop(() => {
    try {
      controls.update();
      renderer.render(scene, camera);
    } catch (err) {
      if (statusEl) {
        statusEl.classList.remove('mv-hidden');
        statusEl.textContent = '渲染出错：' + (err && err.message ? err.message : err);
      }
      console.error('[model-viewer] render error', err);
      return;
    }
    if (statsPending) {
      statsPending = false;
      const hint = root.querySelector('.mv-hint');
      if (hint && debugOn()) {
        hint.textContent += ' | calls=' + renderer.info.render.calls + ' tris=' + renderer.info.render.triangles;
      }
    }
  });

  // 交互按钮
  root.querySelectorAll('[data-mv-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.mvAction;
      if (action === 'reset' && defaultCam) {
        camera.position.copy(defaultCam.pos);
        controls.target.copy(defaultCam.target);
        controls.update();
      } else if (action === 'rotate') {
        controls.autoRotate = !controls.autoRotate;
        controls.autoRotateSpeed = 1.2;
        btn.classList.toggle('is-active', controls.autoRotate);
      } else if (action === 'fullscreen') {
        if (!document.fullscreenElement) {
          root.requestFullscreen && root.requestFullscreen();
        } else {
          document.exitFullscreen && document.exitFullscreen();
        }
      }
    });
  });

  document.addEventListener('fullscreenchange', () => {
    root.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    setTimeout(resize, 60);
  });

  // 供 Pjax 切换页面时释放资源
  return function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    ro.disconnect();
    controls.dispose();
    pmrem.dispose();
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry && obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material && obj.material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
    delete root.dataset.mvInit;
  };
}

const instances = [];

function disposeAll() {
  while (instances.length) {
    const dispose = instances.pop();
    try {
      dispose();
    } catch (e) {
      console.warn('[model-viewer] dispose failed', e);
    }
  }
}

function boot() {
  document.querySelectorAll('.model-viewer').forEach((root) => {
    if (root.dataset.mvInit) return;
    root.dataset.mvInit = '1';
    const dispose = initViewer(root);
    if (typeof dispose === 'function') instances.push(dispose);
  });
}

// 首次加载
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// 主题使用 Pjax 做站内无刷新跳转：切换前销毁旧实例，切换后重建新实例
window.addEventListener('pjax:send', disposeAll);
window.addEventListener('pjax:success', boot);
window.addEventListener('pjax:complete', boot);
