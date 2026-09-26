import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateLocalFingerprintFallback,
  previewNewInstanceFingerprint,
} from "../src/services/instanceFingerprintService";

describe("instanceFingerprintService - System & Hardware Fingerprint Isolation Layer", () => {
  it("generates a complete and valid L2 system & hardware fingerprint profile", () => {
    const profile = generateLocalFingerprintFallback("blank-instance-test");
    assert.match(profile.fingerprintId, /^FP-[0-9A-F]{8}$/);
    assert.match(
      profile.machineGuid,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.match(profile.telemetryMachineId, /^[0-9a-f]{64}$/);
    assert.match(profile.macAddress, /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/);
    assert.match(
      profile.smbiosUuid,
      /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
    );
    assert.match(profile.diskSerial, /^S69ENX0[0-9A-F]{8}$/);
    assert.match(profile.hostname, /^DESKTOP-[0-9A-F]{7}$/);
    assert.equal(profile.isolationLevel, "L2_SYSTEM_HARDWARE_SANDBOX");
    assert.equal(profile.sandboxEnabled, true);
  });

  it("produces distinct fingerprints across blank instances to prevent device linking", async () => {
    const fp1 = await previewNewInstanceFingerprint("instance-1");
    const fp2 = await previewNewInstanceFingerprint("instance-2");
    assert.notEqual(fp1.machineGuid, fp2.machineGuid);
    assert.notEqual(fp1.telemetryMachineId, fp2.telemetryMachineId);
    assert.notEqual(fp1.macAddress, fp2.macAddress);
    assert.notEqual(fp1.diskSerial, fp2.diskSerial);
  });
});
