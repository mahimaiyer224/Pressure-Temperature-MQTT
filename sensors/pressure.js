const mqtt = require('mqtt');
const BROKER_ADDRESS = "mqtt://localhost:1883";
const CLIENT_ID = "pressure_sensor_001";
const TOPIC = 'sensors/pressure/data';
const options = {qos: 1, retain: false};
const STATUS_TOPIC = 'sensors/pressure/status';

const client = mqtt.connect(BROKER_ADDRESS,{
    clientId: CLIENT_ID,
    clean: true,
    will: {
    topic: STATUS_TOPIC,
    payload: 'OFFLINE',
    qos: 1,
    retain: true
}
} );

client.on('connect', ()=>{
    console.log("Connected to Broker");
    client.publish(STATUS_TOPIC, "ONLINE", options, (err) => {
        console.log('Status: ONLINE');
    });


function randomFloat(min, max){
    return parseFloat(Math.min(min + Math.random() * (max - min), max).toFixed(2));
}

function get_pressure(){
    let data = randomFloat(0.1, 10.1);
    client.publish(TOPIC, data.toString(), options, err => {
        if(err)
            console.error("Publish Error: ", err);
        else{
            console.log(`Pressure: ${data} logged to the Topic: ${TOPIC} with QoS: ${options.qos} successfully. `)
        }
    });
}

client.on('error', err =>{
    console.error("Connection Error: ", err);
});

setInterval(get_pressure, 10000);
})
