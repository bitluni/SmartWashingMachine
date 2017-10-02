load('api_config.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_timer.js');
load("api_pwm.js");

let led = 2; //D4
let baseTopic = 'washingMachine/';
let photoresistorName = ["led1", "led2", "led3"];
let readInterval = 1000;
let oldState = {};

let photoresistorGpios = [14, //D5
  12, //D6
  13]; //D7

let useServo = true;
let servoSubTopic = "servo";
let servoGpio = 0; //D3
let servoStart = 0.055;
let servoEnd = 0.095;
let servoPushDuration = 3000;
let servoState = 0;

GPIO.set_mode(led, GPIO.MODE_OUTPUT);
GPIO.write(led, 1);

function pinChanged(pin, name)
{
  let newState = GPIO.read(pin);
  if(newState === oldState[pin]) return;  //get out if nothing changed
  print(name, " changed to ", newState);
  oldState[pin] = newState;
  MQTT.pub(baseTopic + name, JSON.stringify(newState), 1);
}

function setup()
{
  for(let i = 0; i < photoresistorGpios.length; i++)
  {
    oldState[photoresistorGpios[i]] = -1; //initialize states
    GPIO.set_mode(photoresistorGpios[i], GPIO.MODE_INPUT);  //set as input (no pull)
    pinChanged(photoresistorGpios[i], photoresistorName[i]);  //first update
    GPIO.set_int_handler(photoresistorGpios[i], GPIO.INT_EDGE_ANY, pinChanged, photoresistorName[i]); //set handler
    GPIO.enable_int(photoresistorGpios[i]); //enable interrupt
  }
}

function refeshServerState()
{
  for(let i = 0; i < photoresistorGpios.length; i++)
  {
    let newState = GPIO.read(pin);
    oldState[pin] = newState;
    MQTT.pub(baseTopic + photoresistorName[i], JSON.stringify(newState), 1);
  }
}

function moveServo(conn, topic, msg)
{
  let s = JSON.parse(msg);
	if(s !== 1 || servoState === 1) return;
	servoState = 1;
	print('moving servo');
	GPIO.set_mode(servoGpio, GPIO.MODE_OUTPUT);
	//move to position 0
	PWM.set(servoGpio, 50, servoEnd);
	//wait for servo
	Timer.set(servoPushDuration, false , function() {
			PWM.set(servoGpio, 50, servoStart);
			//wait for servo
			Timer.set(1000, false , function() {
				//turn off
				PWM.set(servoGpio, 50, 0);
				GPIO.set_mode(servoGpio, GPIO.MODE_INPUT);
				print('servo off');
				servoState = 0;
				MQTT.pub(baseTopic + servoSubTopic, JSON.stringify(0), 1);
			}, null);
	}, null);
}

let subbed = false;
MQTT.setEventHandler(function(conn, ev, edata) 
	{
		if(ev === MQTT.EV_CONNACK)	//connection to MQTT established
		{
				if(subbed) //check if already subbed
				{
					refeshServerState();
					return;	
				}
				print('Connected first time -> subbing');
				if(useServo)
					MQTT.sub(baseTopic + servoSubTopic, moveServo);	//sub to servo topic
				setup();
				subbed = true;
		}
	}, null);

print('Waiting for mqtt to connect...');