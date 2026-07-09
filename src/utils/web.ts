import { WebPlugin } from '@capacitor/core';
import type { EpsonLabelPlugin } from './EpsonPlugin';

export class EpsonLabelWeb extends WebPlugin implements EpsonLabelPlugin {
    async printLabel(): Promise<{ success: boolean; printer: string; address: string }> {
        throw new Error('La impresión Bluetooth Epson solo está disponible en la app Android.');
    }

    async findEpsonPrinters(): Promise<{
        devices: Array<{ name: string; address: string; isEpson: boolean; isTarget?: boolean }>;
        total: number;
        targetPrinter: string;
        targetFound: boolean;
        targetDevice: string;
    }> {
        throw new Error('El diagnóstico Bluetooth Epson solo está disponible en la app Android.');
    }

    async preparePrinter(): Promise<{ ready: boolean; address: string; name: string }> {
        throw new Error('La preparación de impresora Epson solo está disponible en la app Android.');
    }
}
