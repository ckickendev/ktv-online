'use client';

import React from 'react';
import {
  MicrophoneStudioDialog,
  MicrophoneStudioDialogProps,
} from './MicrophoneStudioDialog';

export type AudioDeviceSettingsModalProps = MicrophoneStudioDialogProps;

/**
 * Backward-compatible wrapper for MicrophoneStudioDialog.
 */
export function AudioDeviceSettingsModal(props: AudioDeviceSettingsModalProps) {
  return <MicrophoneStudioDialog {...props} />;
}
