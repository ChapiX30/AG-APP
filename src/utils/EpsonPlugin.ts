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
    }): Promise<{
        success: boolean;
        printer: string;
        address: string;
    }>;

    /**
     * DIAGNÓSTICO: lista todos los dispositivos Bluetooth emparejados.
     * Úsalo para verificar si la impresora aparece en la lista.
     * 
     * Llámalo así en tu app para depurar:
     *   const result = await EpsonLabel.findEpsonPrinters();
     *   console.log(JSON.stringify(result, null, 2));
     */
    findEpsonPrinters(): Promise<{
        devices: Array<{ name: string; address: string; isEpson: boolean; isTarget?: boolean }>;
        total: number;
        targetPrinter: string;
        targetFound: boolean;
        targetDevice: string;
    }>;
}

const EpsonLabel = registerPlugin<EpsonLabelPlugin>('EpsonLabel');

export default EpsonLabel;