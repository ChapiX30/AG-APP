import { registerPlugin } from '@capacitor/core';

export interface EpsonLabelPlugin {
  printBase64(options: { base64: string }): Promise<void>;
}

const EpsonLabel = registerPlugin<EpsonLabelPlugin>('EpsonLabel');

export default EpsonLabel;