describe("An NES controller", function(){
	var CPU = new NEScript.CPU();
	var Controller = new NEScript.Controller(CPU._mainMemory);
	var DEFAULT_A_KEY = 88;
	var DEFAULT_DOWN_KEY = 40;

	//Simulate key presses and releases
	//http://stackoverflow.com/questions/26966044/simulate-fake-keypress-in-jasmine

	function keyPress(key) {
	  var event = document.createEvent('Event');
	  event.keyCode = key;
	  event.initEvent('keydown');
	  document.dispatchEvent(event);
	}

	function keyRelease(key) {
	  var event = document.createEvent('Event');
	  event.keyCode = key;
	  event.initEvent('keyup');
	  document.dispatchEvent(event);
	}

	function checkForAllOff(){
		var buttons = ["A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT"];
		for(var i = 0; i < buttons.length; i++){
			var currentButton = buttons[i];
			expect(Controller.activeStates[currentButton]).toEqual(false);
		}
	}

	it("has a connection to CPU main memory", function(){
		Controller.RAM.writeByte(0xFACE, 0xAB);
		expect(CPU.readByte(0xFACE)).toEqual(0xAB);

		CPU.totalReset();
		expect(Controller.RAM.readByte(0xFACE)).toEqual(0);
	})

	it("responds to button presses", function(){
		Controller.connect();
		expect(Controller.activeStates.A).toEqual(false);
		keyPress(DEFAULT_A_KEY);
		expect(Controller.activeStates.A).toEqual(true);
		keyRelease(DEFAULT_A_KEY);
		expect(Controller.activeStates.A).toEqual(false);
		keyPress(DEFAULT_DOWN_KEY)
		expect(Controller.activeStates.DOWN).toEqual(true);
		keyRelease(DEFAULT_DOWN_KEY);
		expect(Controller.activeStates.DOWN).toEqual(false);
	})

	it("does not respond to keys that are not bound", function(){
		keyPress(62);
		checkForAllOff();
	})

	it("can disconnect itself", function(){
		Controller.disconnect();
		keyPress(DEFAULT_A_KEY);
		keyPress(DEFAULT_DOWN_KEY);
		checkForAllOff();
	})

	it("enters strobe state", function(){
		Controller.connect();
		keyPress(DEFAULT_A_KEY);
		keyPress(DEFAULT_DOWN_KEY);

		expect(Controller.strobeCounter).toEqual(0);
		Controller.receiveSignal(1);
		expect(Controller.strobeCounter).toEqual(0);
		Controller.receiveSignal(0);
		expect(Controller.strobeCounter).toEqual(24);
	})

	//Controller now begins strobe procedure

	it("executes strobe procedure", function(){
		Controller.tick();
		expect(CPU.readByte(0x4016)).toEqual(1);
		Controller.tick();
		expect(CPU.readByte(0x4016)).toEqual(0);
		expect(Controller.strobeCounter).toEqual(22);
		Controller.tick();
		Controller.tick();
		Controller.tick();
		Controller.tick();
		expect(CPU.readByte(0x4016)).toEqual(1);
		Controller.tick();
		expect(CPU.readByte(0x4016)).toEqual(0);
		Controller.tick();
		expect(CPU.readByte(0x4016)).toEqual(0);
	})

	it("does not override the last address written to by the CPU when executing strobe", function(){
		//Controller is still executing strobe
		CPU.writeByte(0xABCD, 0xAB);
		Controller.tick();
		expect(CPU._mainMemory.lastWrite).toEqual(0xABCD);
	})
})