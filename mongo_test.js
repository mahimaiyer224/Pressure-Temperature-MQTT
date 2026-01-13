const {MongoClient} = require('mongodb');
const uri = "mongodb://localhost:27017";

const client = new MongoClient(uri);

async function run() {
    try{
        await client.connect();
        console.log("Successfully connected to MongoDB");

        const db = client.db('pt_db');
        const collection = db.collection('sensor_readings');

        const doc = {
            sensorType: "Temperature",
            value: 23.0,
            unit: "C",
            timestamp: new Date(),
            source: "manual-entry"
        };
        const insertOneResult = await collection.insertOne(doc);
        console.log(`A document was inserted with the _id: ${insertOneResult.insertedId}`);
    }
    catch(e){
        console.log('An error occurred: ', e);
    } finally{
        await client.close();
    }
}

run().catch(console.dir);