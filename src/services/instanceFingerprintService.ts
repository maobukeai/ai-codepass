import { invoke } from "@tauri-apps/api/core";

export interface InstanceFingerprintProfile {
  fingerprintId: string;
  machineGuid: string;
  telemetryMachineId: string;
  devDeviceId: string;
  sqmId: string;
  serviceMachineId: string;
  macAddress: string;
  smbiosUuid: string;
  diskSerial: string;
  hostname: string;
  osBuild: string;
  cpuModel: string;
  gpuRenderer: string;
  isolationLevel: string;
  sandboxEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomUuidV4(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
}

export function generateLocalFingerprintFallback(seedHint?: string): InstanceFingerprintProfile {
  const now = Date.now();
  const telemetryMachineId = randomHex(64);
  const fingerprintId = `FP-${telemetryMachineId.slice(0, 8).toUpperCase()}`;
  const ouiList = ["00:E0:4C", "A8:A1:59", "D8:BB:C1", "04:D4:C4"];
  const oui = ouiList[Math.floor(Math.random() * ouiList.length)];
  const macAddress = `${oui}:${randomHex(2).toUpperCase()}:${randomHex(2).toUpperCase()}:${randomHex(2).toUpperCase()}`;
  const hostSuffix = randomHex(7).toUpperCase();
  const diskSuffix = randomHex(8).toUpperCase();
  const cpuModels = [
    "13th Gen Intel(R) Core(TM) i7-13700K",
    "14th Gen Intel(R) Core(TM) i7-14700KF",
    "AMD Ryzen 7 7800X3D 8-Core Processor",
    "Intel(R) Core(TM) Ultra 7 155H",
  ];
  const gpuRenderers = [
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ];
  void seedHint;

  return {
    fingerprintId,
    machineGuid: randomUuidV4(),
    telemetryMachineId,
    devDeviceId: randomUuidV4(),
    sqmId: `{${randomUuidV4().toUpperCase()}}`,
    serviceMachineId: randomUuidV4(),
    macAddress,
    smbiosUuid: randomUuidV4().toUpperCase(),
    diskSerial: `S69ENX0${diskSuffix}`,
    hostname: `DESKTOP-${hostSuffix}`,
    osBuild: "10.0.22631.4317",
    cpuModel: cpuModels[Math.floor(Math.random() * cpuModels.length)],
    gpuRenderer: gpuRenderers[Math.floor(Math.random() * gpuRenderers.length)],
    isolationLevel: "L2_SYSTEM_HARDWARE_SANDBOX",
    sandboxEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getInstanceFingerprint(
  userDataDir: string,
): Promise<InstanceFingerprintProfile> {
  try {
    const res = await invoke<InstanceFingerprintProfile>("get_instance_fingerprint", {
      userDataDir,
    });
    if (res && res.fingerprintId) {
      return res;
    }
  } catch {
    // Fallback when running in standalone browser preview
  }
  return generateLocalFingerprintFallback(userDataDir);
}

export async function regenerateInstanceFingerprint(
  userDataDir: string,
): Promise<InstanceFingerprintProfile> {
  try {
    const res = await invoke<InstanceFingerprintProfile>("regenerate_instance_fingerprint", {
      userDataDir,
    });
    if (res && res.fingerprintId) {
      return res;
    }
  } catch {
    // Fallback
  }
  return generateLocalFingerprintFallback(userDataDir);
}

export async function previewNewInstanceFingerprint(
  seedHint?: string,
): Promise<InstanceFingerprintProfile> {
  try {
    const res = await invoke<InstanceFingerprintProfile>("preview_new_instance_fingerprint", {
      seedHint: seedHint ?? null,
    });
    if (res && res.fingerprintId) {
      return res;
    }
  } catch {
    // Fallback
  }
  return generateLocalFingerprintFallback(seedHint);
}

export async function purgeInstanceAccountResiduals(
  userDataDir: string,
): Promise<InstanceFingerprintProfile> {
  try {
    const res = await invoke<InstanceFingerprintProfile>("purge_instance_account_residuals", {
      userDataDir,
    });
    if (res && res.fingerprintId) {
      return res;
    }
  } catch {
    // Fallback
  }
  return generateLocalFingerprintFallback(userDataDir);
}
