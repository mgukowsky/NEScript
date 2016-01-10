//An object to hold data about an iNES formatted ROM

(function(){

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	//@raw - A Uint8Array
	var ROM = NEScript.ROM = function(raw){
		if(!isiNES(raw)){
			throw new Error("Not a valid iNES file");
		}

		//Create the ROM based on iNES header

		//# of 16KB banks (for game logic)
		this.numBanksPRG_ROM = raw[4];

		//# of 8KB banks (for graphics)
		this.numBanksCHR_ROM = raw[5];

		//Either horizontal or vertical mirroring
		this.verticalMirroring = !!((raw[6]) & 0x01);

		this.batteryRAM 		= !!((raw[6]) & 0x02);
		this.trainer 				= !!((raw[6]) & 0x04);
		this.fourScreenVRAM	= !!((raw[6]) & 0x08)
		this.mapperID = ((raw[6]) >> 4) + (raw[7] & 0xF0)

		//# of 8KB RAM banks (0 assumes a single bank)
		this.numBanksPRG_RAM = (raw[8] === 0) ? 1 : raw[8];

		var l = raw.length;

		this._DATA = new Uint8Array(l);
		for(var i = 0; i < l; i++){
			this._DATA[i] = raw[i];
		}
	}

	//Returns a slice of the underlying Uint8Array (NOT another RAM object)
	ROM.prototype.slice = function(start, end){
		return Array.prototype.slice.call(this._DATA, start, end);
	}


	//Check for magic bytes at start of iNES file
	function isiNES(raw){
		return (raw[0] === 0x4E) && //'N'
					 (raw[1] === 0x45) && //'E'
					 (raw[2] === 0x53) && //'S'
					 (raw[3] === 0x1A);		//magic number
	}


})()