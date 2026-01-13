const mqtt = require('mqtt');

const BROKER_ADDRESS = 'mqtt://localhost:1883';
const CLIENT_ID = "temp_sensor_001";
const TOPIC = 'sensors/temperature/data';
const STATUS_TOPIC = 'sensors/temperature/status';
const options = {qos: 1, retain: false};
const client = mqtt.connect(BROKER_ADDRESS, {
    clientId: CLIENT_ID,
    clean: true //set to true to start a fresh session
,
will: {
    topic: STATUS_TOPIC,
    payload: 'OFFLINE',
    qos: 1,
    retain: true
}});

client.on('connect', ()=>{
    console.log("Connected to the Broker");
    client.publish(STATUS_TOPIC, "ONLINE", options, (err) => {
        console.log('Status: ONLINE');
    });
    function randomFloat(min, max) {
  return parseFloat(
    Math.min(min + Math.random() * (max - min), max).toFixed(2)
  );
}
function get_temperature(){
    let data = randomFloat(5, 110);
    client.publish(TOPIC, data.toString(), options, err =>{
        if(err)
            console.error("Publish Error:", err);
        else{
            console.log(`Temperature: ${data} logged to the Topic: ${TOPIC} with QoS: ${options.qos} successfully`);
        }
    });
}
client.on('error', (err) =>{
    console.error("Connection Error: ", err);
    client.end();
});
setInterval(get_temperature, 10000);
})