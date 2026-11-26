import test from 'node:test';
import assert from 'node:assert/strict';
import { CALM_PRESETS, MAX_CALM_GAIN, DUCK_FACTOR, clampGain, createCalmAudioController } from '../calm-audio.js';

test('calm-audio: presets are well-formed and sensory gain ceiling is enforced', () => {
  assert.equal(CALM_PRESETS.length, 4);
  for (const p of CALM_PRESETS) {
    assert.ok(p.id && p.label && p.icon && p.description);
  }
  assert.equal(clampGain(0), 0);
  assert.equal(clampGain(-0.5), 0);
  assert.equal(clampGain(1.0), MAX_CALM_GAIN);
  assert.equal(clampGain(5.0), MAX_CALM_GAIN);
  assert.ok(MAX_CALM_GAIN <= 0.4, 'Max calm gain must stay gentle for sensory safety');
});

test('calm-audio: controller toggles presets, enforces volume cap, and ducks during speech', () => {
  // Headless controller (null AudioContext) still tracks all state transitions cleanly
  const ctrl = createCalmAudioController(() => null);
  assert.equal(ctrl.getState().activeId, null);
  assert.equal(ctrl.getState().effectiveGain, 0);

  assert.equal(ctrl.start('ocean'), true);
  assert.equal(ctrl.getState().activeId, 'ocean');
  const normalGain = ctrl.getState().effectiveGain;
  assert.ok(normalGain > 0 && normalGain <= MAX_CALM_GAIN);

  // Ducking during TTS drops gain to DUCK_FACTOR
  ctrl.duck();
  assert.equal(ctrl.getState().ducked, true);
  assert.ok(Math.abs(ctrl.getState().effectiveGain - normalGain * DUCK_FACTOR) < 1e-9);

  // Unducking restores gain
  ctrl.unduck();
  assert.equal(ctrl.getState().ducked, false);
  assert.ok(Math.abs(ctrl.getState().effectiveGain - normalGain) < 1e-9);

  // Tapping active preset toggles it off
  assert.equal(ctrl.start('ocean'), false);
  assert.equal(ctrl.getState().activeId, null);
  assert.equal(ctrl.getState().effectiveGain, 0);
});
