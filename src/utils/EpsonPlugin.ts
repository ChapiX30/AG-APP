import { registerPlugin } from '@capacitor/core';

export interface EpsonLabelPlugin {
    printLabel(options: {
        id: string;
        fechaCal: string;
        fechaSug: string;
        certificado: string;
        calibro: string;
        tapeSize: string;
    }): Promise<void>;

    findEpsonPackages(): Promise<{ packages: string[]; count: number }>;
}

const EpsonLabel = registerPlugin<EpsonLabelPlugin>('EpsonLabel');

export default EpsonLabel;