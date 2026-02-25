import { WebPlugin } from '@capacitor/core';
import type { EpsonLabelPlugin } from './EpsonPlugin';

export class EpsonLabelWeb extends WebPlugin implements EpsonLabelPlugin {
  async printBase64(options: { base64: string; tapeSize?: string }): Promise<void> {
    console.log('EpsonLabel plugin no disponible en web', options);
    throw new Error('La impresión Epson solo está disponible en la app Android');
  }
}
