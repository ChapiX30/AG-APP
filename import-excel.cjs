const admin = require('firebase-admin');
const XLSX = require('xlsx');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const workbook = XLSX.readFile('./datos_base_friday.xlsx');
const sheetName = workbook.SheetNames[0];
const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

async function importData() {
    try {
        console.log('Iniciando importación...');

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            row.createdAt = new Date().toISOString();
            row.lastUpdated = new Date().toISOString();

            await db.collection('friday_data').add(row);
            console.log(`Fila ${i + 1} importada`);
        }

        console.log('✅ Importación completada exitosamente!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en la importación:', error);
        process.exit(1);
    }
}

importData();
