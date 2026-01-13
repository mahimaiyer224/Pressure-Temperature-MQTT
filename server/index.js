const express = require('express');
const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(require('cors')());

/* ------------------ CONFIG ------------------ */
const PORT = 5000;
const BROKER_ADDRESS = 'mqtt://localhost:1883';
const HOST_NAME = '0.0.0.0'
const DATA_TOPICS = [
    'sensors/temperature/data', 
    'sensors/pressure/data'
];
const STATUS_TOPICS = [
    'sensors/temperature/status',
    'sensors/pressure/status'
];

const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'pt_db';
const COLLECTION_NAME = 'sensor_readings';

const MQTT_CLIENT_ID = 'mqtt_ingestion_server_001';
const MQTT_OPTIONS = { qos: 1, retain: false };

/* ------------------ STATE ------------------ */
let collection;
let mqttClient;

/* ------------------ MONGODB ------------------ */
async function connectDB() {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
    console.log('Connected to MongoDB');
}

/* ------------------ MQTT SETUP ------------------ */
async function setupMQTT() {
    mqttClient = mqtt.connect(BROKER_ADDRESS, {
        clientId: MQTT_CLIENT_ID,
        clean: true
    });

    mqttClient.on('connect', () => {
        console.log('Connected to MQTT Broker');
        
        DATA_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, MQTT_OPTIONS);
            console.log(`Subscribed to ${topic}`);
        });
        
        STATUS_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, MQTT_OPTIONS);
            console.log(`Subscribed to ${topic}`);
        });
    });

    mqttClient.on('message', async (topic, message) => {
        const payload = message.toString();
        
        let sensorType, unit, status, value = null;

        // Handle DATA topics - RAW NUMBERS from sensors
        if (topic === 'sensors/temperature/data') {
            value = parseFloat(payload);
            sensorType = 'Temperature';
            unit = 'C';
            status = 'OK';
            
            if (!Number.isNaN(value)) {
                console.log(`[INGEST] ${sensorType}: ${value} ${unit}`);
            } else {
                console.error('Invalid temperature value:', payload);
                return;
            }
        } 
        else if (topic === 'sensors/pressure/data') {
            value = parseFloat(payload);
            sensorType = 'Pressure';
            unit = 'bar';
            status = 'OK';
            
            if (!Number.isNaN(value)) {
                console.log(` [INGEST] ${sensorType}: ${value} ${unit}`);
            } else {
                console.error('Invalid pressure value:', payload);
                return;
            }
        } 
        // Handle STATUS topics (LWT) - "ONLINE"/"OFFLINE" strings
        else if (topic === 'sensors/temperature/status') {
            status = payload === 'ONLINE' ? 'OK' : 'FAILED';
            sensorType = 'Temperature';
            console.log(` ${sensorType} status: ${status}`);
        } 
        else if (topic === 'sensors/pressure/status') {
            status = payload === 'ONLINE' ? 'OK' : 'FAILED';
            sensorType = 'Pressure';
            console.log(` ${sensorType} status: ${status}`);
        } 
        else {
            console.log(`ℹUnknown topic: ${topic}`);
            return;
        }

        // Insert/Update in MongoDB
        try {
            await collection.updateOne(
                { sensorType },
                {
                    $set: {
                        sensorType,
                        value: value,  // null for status-only updates
                        unit: unit || null,
                        timestamp: new Date(),
                        source: 'MQTT',
                        status
                    }, 
                },
                {upsert: true}
            );
            console.log(` DB updated: ${sensorType} (${status})`);
        } catch (err) {
            console.error(' MongoDB insert error:', err);
        }
    });

    mqttClient.on('error', (err) => {
        console.error(' MQTT error:', err.message);
    });
}

/* ------------------ HTTP API ------------------ */
app.get('/status', async (req, res) => {
    try {
        // Get LATEST data for each sensor/valve type
        const pipeline = [
            { $sort: { timestamp: -1 } },
            { $group: {
                _id: '$sensorType',
                latest: { $first: '$$ROOT' }
            }},
            { $replaceRoot: { newRoot: '$latest' } }
        ];
        
        const docs = await collection.aggregate(pipeline).toArray();
        const status = {};

        docs.forEach(doc => {
            const type = doc.sensorType;
            
            // 🔧 VALVES (controller writes)
            if (doc.valve_on !== undefined) {
                const valveMap = {
                    'heat_valve': 'heat_valve',
                    'cool_valve': 'cool_valve',
                    'pressureIn_valve': 'pressureIn_valve', 
                    'pressureOut_valve': 'pressureOut_valve'
                };
                const valveKey = valveMap[type] || type;
                status[valveKey] = doc.valve_on ? 'OPEN' : 'CLOSED';
            }
            // 🌡️ SENSORS (MQTT data + LWT status)
            else if (['Temperature', 'Pressure'].includes(type)) {
                status[type] = {
                    status: doc.status || (doc.value ? 'OK' : 'OFFLINE'), // LWT handling
                    value: doc.value,
                    unit: doc.unit,
                    timestamp: doc.timestamp,
                    age: Math.floor((new Date() - new Date(doc.timestamp)) / 1000) + 's ago'
                };
            }
        });

        console.log('🟢 LIVE STATUS:', Object.keys(status).join(', '));
        res.json(status);
    } catch (err) {
        console.error('❌ Status error:', err);
        res.status(500).json({ error: 'Status generation failed' });
    }
});


/* ------------------ STARTUP ------------------ */
(async () => {
    await connectDB();
    await setupMQTT();
    
    app.listen(PORT, HOST_NAME, () => {
        console.log(`MQTT Ingestion Server running on http://${HOST_NAME}:${PORT}`);
        console.log(`Data topics: ${DATA_TOPICS.join(', ')}`);
        console.log(`Status topics: ${STATUS_TOPICS.join(', ')}`);
    });
})();
