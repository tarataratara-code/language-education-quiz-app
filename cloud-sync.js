const APP_ID = "language-education-quiz-app";
const FIREBASE_VERSION = "12.16.0";
const config = globalThis.LANGUAGE_EDUCATION_FIREBASE_CONFIG;

const status = document.getElementById("cloudStatus");
const userLabel = document.getElementById("cloudUser");
const statusDot = document.getElementById("cloudStatusDot");
const signInButton = document.getElementById("googleSignIn");
const signOutButton = document.getElementById("googleSignOut");

let currentUser = null;
let cloudDocument = null;
let unsubscribeCloud = null;
let saveTimer = null;
let firebaseApi = null;

function setStatus(label, detail, state = "") {
  status.textContent = label;
  userLabel.textContent = detail;
  statusDot.className = `cloud-status-dot${state ? ` ${state}` : ""}`;
}

function timestampOf(record) {
  const value = Date.parse(record?.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function mergeSnapshots(local, cloud) {
  const mergedState = {};
  const localState = local?.state || {};
  const cloudState = cloud?.state || {};

  for (const id of new Set([...Object.keys(cloudState), ...Object.keys(localState)])) {
    const localRecord = localState[id];
    const cloudRecord = cloudState[id];
    if (!localRecord) mergedState[id] = cloudRecord;
    else if (!cloudRecord) mergedState[id] = localRecord;
    else mergedState[id] = timestampOf(localRecord) >= timestampOf(cloudRecord) ? localRecord : cloudRecord;
  }

  return {
    app: APP_ID,
    version: 1,
    state: mergedState,
    overrides: { ...(cloud?.overrides || {}), ...(local?.overrides || {}) },
    updatedAt: new Date().toISOString(),
  };
}

function localSnapshot() {
  return globalThis.LanguageEducationApp?.getProgressSnapshot?.() || {
    app: APP_ID,
    version: 1,
    state: {},
    overrides: {},
  };
}

function applySnapshot(snapshot) {
  globalThis.LanguageEducationApp?.applyProgressSnapshot?.(snapshot);
}

async function saveToCloud() {
  if (!currentUser || !cloudDocument || !firebaseApi) return;
  setStatus("同期中", currentUser.email || "Googleアカウント", "syncing");
  const snapshot = localSnapshot();
  await firebaseApi.setDoc(cloudDocument, {
    ...snapshot,
    ownerUid: currentUser.uid,
    cloudUpdatedAt: firebaseApi.serverTimestamp(),
  }, { merge: true });
  setStatus("同期済み", currentUser.email || "Googleアカウント", "synced");
}

function scheduleCloudSave() {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToCloud().catch(() => {
      setStatus("端末に保存済み", "通信が戻ると自動で同期します", "error");
    });
  }, 700);
}

async function connectUser(user) {
  currentUser = user;
  signInButton.hidden = true;
  signOutButton.hidden = false;
  setStatus("同期を確認中", user.email || "Googleアカウント", "syncing");
  cloudDocument = firebaseApi.doc(firebaseApi.db, "users", user.uid, "apps", APP_ID);

  const cloudSnapshot = await firebaseApi.getDoc(cloudDocument);
  const merged = mergeSnapshots(localSnapshot(), cloudSnapshot.exists() ? cloudSnapshot.data() : null);
  applySnapshot(merged);
  await saveToCloud();

  unsubscribeCloud?.();
  unsubscribeCloud = firebaseApi.onSnapshot(cloudDocument, (snapshot) => {
    if (!snapshot.exists()) return;
    const unified = mergeSnapshots(localSnapshot(), snapshot.data());
    applySnapshot(unified);
    setStatus("同期済み", user.email || "Googleアカウント", "synced");
  }, () => {
    setStatus("端末に保存済み", "クラウドへの接続を確認してください", "error");
  });
}

function disconnectUser() {
  currentUser = null;
  cloudDocument = null;
  unsubscribeCloud?.();
  unsubscribeCloud = null;
  signInButton.hidden = false;
  signOutButton.hidden = true;
  setStatus("この端末に保存中", "Googleログインでパソコンとスマホを自動同期できます");
}

async function start() {
  if (!config?.apiKey || !config?.projectId) {
    signInButton.disabled = true;
    setStatus("クラウド設定待ち", "Google側の保存場所を準備しています", "syncing");
    return;
  }

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);
    const firebaseApp = appModule.initializeApp(config);
    const auth = authModule.getAuth(firebaseApp);
    const db = firestoreModule.getFirestore(firebaseApp);
    const provider = new authModule.GoogleAuthProvider();
    firebaseApi = { ...authModule, ...firestoreModule, auth, db, provider };
    await authModule.getRedirectResult(auth).catch(() => null);

    signInButton.addEventListener("click", async () => {
      signInButton.disabled = true;
      setStatus("Googleログイン中", "アカウントを選んでください", "syncing");
      try {
        await authModule.signInWithPopup(auth, provider);
      } catch (error) {
        if (error?.code === "auth/popup-blocked") {
          await authModule.signInWithRedirect(auth, provider);
        } else if (error?.code !== "auth/popup-closed-by-user") {
          setStatus("ログインできませんでした", "もう一度Googleログインを押してください", "error");
        }
      } finally {
        signInButton.disabled = false;
      }
    });

    signOutButton.addEventListener("click", () => authModule.signOut(auth));
    authModule.onAuthStateChanged(auth, (user) => {
      if (user) connectUser(user).catch(() => {
        setStatus("同期できませんでした", "Google側の設定を確認してください", "error");
      });
      else disconnectUser();
    });
    window.addEventListener("language-education-progress-changed", scheduleCloudSave);
  } catch {
    setStatus("クラウドを読み込めません", "通信を確認して画面を開き直してください", "error");
  }
}

start();
