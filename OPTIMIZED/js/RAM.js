(function(){
	if (typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	//A basic RAM class to encapsulate 8-bit memory I/O, and abstract away endianness

	var RAM = NEScript.RAM = function(memLength){
		//underlying bytes of the RAM. Uint8Array takes care of value 
		//checking & wrapping for us.
		this._memory = new Uint8Array(memLength);
		this.lastRead = null;
		this.lastWrite = null;
	}

	//Getters & setters
	RAM.prototype.readByte = function(address){
		//lastRead is never used, don't bother
		//this.lastRead = address;
		return this._memory[address];
	}

	RAM.prototype.writeByte = function(address, value){
		this.lastWrite = address;
		this._memory[address] = value;
	}

	//Accounts for little endian when I/O is >1 byte long
	//TODO: will avoiding bitwise operators <really> make these faster?
	RAM.prototype.readWord = function(address){
		this.lastRead = address;
		var lobyte = this._memory[address];
		var hibyte = this._memory[address + 1];
		return lobyte + (hibyte << 8);
	}

	RAM.prototype.writeWord = function(address, value){
		this.lastWrite = address;
		this._memory[address] = value & 0xFF;
		this._memory[address + 1] = (value & 0xFF00) >> 8;
	}

	//0x1000 worth of data
	RAM.prototype.loadBank4KB = function(startAddr, data){
		var previousWrite = this.lastWrite;
		for(var i = 0; i < 4096; i++){
			this.writeByte(startAddr + i, data[i]);
		}
		//Don't count this as a write
		this.lastWrite = previousWrite;
	}

	//0x2000 worth of data
	RAM.prototype.loadBank8KB = function(startAddr, data){
		var previousWrite = this.lastWrite;
		for(var i = 0; i < 8192; i++){
			this.writeByte(startAddr + i, data[i]);
		}
		this.lastWrite = previousWrite;
	}

	//0x4000 worth of data
	RAM.prototype.loadBank16KB = function(startAddr, data){
		var previousWrite = this.lastWrite;
		for(var i = 0; i < 16384; i++){
			this.writeByte(startAddr + i, data[i]);
		}
		//Don't count this as a write
		this.lastWrite = previousWrite;
	}

	//Returns a slice of the underlying Uint8Array (NOT another RAM object)
	RAM.prototype.slice = function(start, end){
		return Array.prototype.slice.call(this._memory, start, end);
	}

	RAM.prototype.reset = function(){
		for(var i = 0; i < this._memory.length; i++){
			this.writeByte(i, 0);
		}
		this.lastRead = null;
		this.lastWrite = null;
	}

})();