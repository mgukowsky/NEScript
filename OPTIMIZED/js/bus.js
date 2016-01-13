//This class holds all memory for the CPU and PPU, and receives/sends messages
//between the NES components. This class avoids cross references between the 
//components.

(function(){

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	var Bus = NEScript.Bus = function(){
		//'address bus' values.
		//Should be set by CPU instructions which perform R/W operations.
		this.lastMMread = null;
		this.lastMMwrite = null;

		//The system main memory
		this.MM = new Uint8Array(0x10000);

		//PPU vram
		this.VM = new Uint8Array(0x4000);

		//PPU sprite memory
		this.OAM = new Uint8Array(0x100);
	}

	Bus.prototype.reset = function(){
		var i;

		for(i = 0; i < 0x10000; i++){
			this.MM[i] = 0;
		}

		for(i = 0; i < 0x4000; i++){
			this.VM[i] = 0;
		}

		for(i = 0; i < 0x100; i++){
			this.OAM[i] = 0;
		}

		this.lastMMread = null;
		this.lastMMwrite = null;
	}

	//Allow components to communicate with one another through the bus, 
	//once they have all been instantiated.
	Bus.prototype.connect = function(CPU, PPU, Controller, Mapper){
		this.CPU = CPU;
		this.PPU = PPU;
		this.Controller = Controller;
		this.Mapper = Mapper;
	} 

})()