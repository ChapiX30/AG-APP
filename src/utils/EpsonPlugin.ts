import { registerPlugin } from '@capacitor/core';

export interface EpsonLabelPlugin {
    /**
     * Imprime una etiqueta directamente a la EPSON LW-PX400 vía Bluetooth.
     * La impresora debe estar EMPAREJADA en Ajustes → Bluetooth antes de llamar esto.
     */
    printLabel(options: {
        id: string;
        fechaCal: string;
        fechaSug: string;
        certificado: string;
        calibro: string;
        tapeSize: '24mm' | '12mm';
        copies?: number;
        printerAddress?: string;
    }): Promise<{
        success: boolean;
        printer: string;
        address: string;
    }>;

    /**
     * Lista dispositivos Bluetooth emparejados y detecta la LW-PX400.
     */
    findEpsonPrinters(): Promise<{
        devices: Array<{
            name: string;
            address: string;
            macAddress?: string;
            deviceId?: string;
            serialNumber?: string;
            alias?: string;
            isEpson: boolean;
            isTarget?: boolean;
        }>;
        total: number;
        targetPrinter: string;
        targetFound: boolean;
        targetDevice: string;
    }>;
}

const EpsonLabel = registerPlugin<EpsonLabelPlugin>('EpsonLabel', {
    web: () => import('./web').then((m) => new m.EpsonLabelWeb()),
});

export default EpsonLabel;
