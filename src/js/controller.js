(function(){
	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/**************************CONSTANTS****************************/

	//TODO: make these instance variables so more than 1 controller can be connected

	//Key codes that map to NES controller button
	var BUTTON_A = 88, //'X' key
			BUTTON_B = 90, //'Z' key
			BUTTON_START = 83, //'S' key
			BUTTON_SELECT = 65, //'A' key
			BUTTON_UP = 38, //up arrow
			BUTTON_DOWN = 40, //down arrow
			BUTTON_LEFT = 37, //left arrow
			BUTTON_RIGHT = 39; //right arrow

	//Map that tells us which key codes to listen for
	var validKeys = {};

	//Map that tells us which button is mapped to which key
	var keyMap = {};

	//Which button to send at each stage of the poll
	var buttonProcMap = {
		//First 8 values sent to $4016 are for controller 1 ($4017 is controller 2)
		24: pollButton.bind(null, "A"),
		23: pollButton.bind(null, "B"),
		22: pollButton.bind(null, "SELECT"),
		21: pollButton.bind(null, "START"),
		20: pollButton.bind(null, "UP"),
		19: pollButton.bind(null, "DOWN"),
		18: pollButton.bind(null, "LEFT"),
		17: pollButton.bind(null, "RIGHT"),

		//Next 8 values are trash, unless a 4 player game (not implemented yet)
		16: returnZero,
		15: returnZero,
		14: returnZero,
		13: returnZero,
		12: returnZero,
		11: returnZero,
		10: returnZero,
		9: returnZero,

		//Next 4 values are the signature of the controller, output from highest to 
		//lowest bit. Only controller 1 is implemented here.
		//0x0 - disconnected
		//0x1 - controller 1 (sent to $4016)
		//0x2 - controller 2 (sent to $4017)
		8: returnZero,
		7: returnZero,
		6: returnZero,
		5: returnOne,

		//Last 4 values are all zeroes
		4: returnZero,
		3: returnZero,
		2: returnZero,
		1: returnZero,
	}

	/**************************INTERFACE****************************/

	var Controller = NEScript.Controller = function(RAM){
		this.RAM = RAM;

		this.activeStates = {A: false, B: false, SELECT: false, START: false,
												 UP: false, DOWN: false, LEFT: false, RIGHT: false};

		//DOM needs an explicit reference to event callback functions in order to 
		//properly remove them, so we need to bind them in advance to properly set up
		//the reference. By making these instance variables, we allow multiple controllers
		//to be connected, since each controller will add its own specific callback upon 
		//connection.
		this.keyOnCallback = keyDown.bind(this);
		this.keyOffCallback = keyUp.bind(this);

		//Used to check for strobe request
		this.previousWrite = null;

		this.strobeCounter = 0;

		//Advance strobe only on a read to $4016;
		this.shouldStrobe = false;

		//Hack for CPU to communicate a read to $4016 to controller
		NEScript.__Controller__ = this;
	}

	Controller.prototype.connect = function(){
		this.mapKeys();

		document.addEventListener("keydown", this.keyOnCallback);
		document.addEventListener("keyup", this.keyOffCallback);
	}

	Controller.prototype.disconnect = function(){
		document.removeEventListener("keydown", this.keyOnCallback);
		document.removeEventListener("keyup", this.keyOffCallback);
	}

	Controller.prototype.mapKeys = function(){
		validKeys = {};

		validKeys[BUTTON_A] = true;
		validKeys[BUTTON_B] = true;
		validKeys[BUTTON_START] = true;
		validKeys[BUTTON_SELECT] = true;
		validKeys[BUTTON_UP] = true;
		validKeys[BUTTON_DOWN] = true;
		validKeys[BUTTON_LEFT] = true;
		validKeys[BUTTON_RIGHT] = true;

		keyMap = {};

		keyMap[BUTTON_A] = "A";
		keyMap[BUTTON_B] = "B";
		keyMap[BUTTON_START] = "START";
		keyMap[BUTTON_SELECT] = "SELECT";
		keyMap[BUTTON_UP] = "UP";
		keyMap[BUTTON_DOWN] = "DOWN";
		keyMap[BUTTON_LEFT] = "LEFT";
		keyMap[BUTTON_RIGHT] = "RIGHT";
	}

	//Mapper sends a write to $4016 (TODO: handle writes to $4017)
	Controller.prototype.receiveSignal = function(value){
		//Anticipate the next write to have bit 0 off
		if((this.previousWrite === null) && (value & 0x01)){
			this.previousWrite = 1;
			//If last write had bit 0 on and current write has bit 0 off, then begin strobing
		} else if ((this.previousWrite === 1) && (!(value & 0x01))){
			this.strobeCounter = 24;
			this.previousWrite = null;
			
			//Do the first strobe now
			this.shouldStrobe = true;
			this.tick();
		} else {
			this.previousWrite = null;
		}
	}

	//***POSSIBLE BUG***: The actual behavior of the controller seems to be to continuously
	//send the value of button A until the strobe signal is received; meaning as long as
	//$4016 is equal to 1 and we are not in strobe state, button A's status should be sent to 
	//$4016. So if a game seems not to responding to button A, this may be why, although
	//omitting this behavior should be inconsequential

	//Aside from listening for key presses, every CPU cycle the controller either 
	//sends the next strobe signal or does nothing.
	Controller.prototype.tick = function(){
		if (this.strobeCounter > 0 && this.shouldStrobe){
			//Second thisArg is what matters, b/c the function is already bound
			var tmpStatus = buttonProcMap[this.strobeCounter].call(this, this);
			//I'm -pretty- sure that it doesn't matter that we're overwriting the other bits ar
			//$4016, since those are apparently only used by the Zapper
			if(tmpStatus){
				this.RAM._memory[0x4016] =  1;
			} else {
				this.RAM._memory[0x4016] =  0;
			}
			this.strobeCounter -= 1;
			this.shouldStrobe = false;
		}
	}


	/*******************************IMPLEMENTATION****************************/

	function keyDown(event){
		if(validKeys[event.keyCode]){
			event.preventDefault();
			event.stopPropagation();
			var currentButton = keyMap[event.keyCode]; //The name of the mapped button
			this.activeStates[currentButton] = true;
		}
	}

	function keyUp(event){
		if(validKeys[event.keyCode]){
			event.preventDefault();
			event.stopPropagation();
			var currentButton = keyMap[event.keyCode];
			this.activeStates[currentButton] = false;
		}
	}

	//Used by strobing procedure. We need to give a separate thisArg since the 
	//function will be bound in the class namespace before it is called by the instance.
	function pollButton(buttonName, thisArg){
		return thisArg.activeStates[buttonName]
	}

	function returnZero(){
		return 0;
	}

	function returnOne(){
		return 1;
	}

})()