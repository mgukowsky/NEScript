describe("The basic RAM module", function(){
	var RAM = new NEScript.RAM(0x10000);

	it("initializes its underlying memory to 0", function(){
		expect(RAM.readByte(0x10)).toEqual(0);
	})

	it("returns undefined when accessing an out of range byte address", function(){
		expect(RAM.readByte(0x10001)).toBeUndefined();
	})

	it("returns NaN when accessing an out of range word address", function(){
		//Should return NaN in either case
		expect(RAM.readWord(0x10001)).toBeNaN();
		expect(RAM.readWord(0x10000)).toBeNaN();
	})

	it("can read and write a byte to an address", function(){
		RAM.writeByte(0xFACE, 0xAB);
		RAM.writeByte(0xDADA, 0x32);

		expect(RAM.readByte(0xFACE)).toEqual(0xAB);
		expect(RAM.readByte(0xDADA)).toEqual(0x32);
	})

	it("can read and write a word to an address", function(){
		RAM.writeWord(0xBABA, 0xABCD);
		RAM.writeWord(0x1234, 0x9876);

		expect(RAM.readWord(0xBABA)).toEqual(0xABCD);
		expect(RAM.readWord(0x1234)).toEqual(0x9876);
	})

	it("loads 8KB to a specific address", function(){
		RAM = new NEScript.RAM(0x10000);
		var testData = new Array(0x2000);
		//IE can't do "Array#fill"
		//testData.fill(0xAB);
		for(var i = 0; i < testData.length; i++){
			testData[i] = 0xAB;
		}

		RAM.loadBank8KB(0x3000, testData);
		expect(RAM.readByte(0x3000)).toEqual(0xAB);
		expect(RAM.readByte(0x3010)).toEqual(0xAB);
		expect(RAM.readByte(0x4200)).toEqual(0xAB);
		expect(RAM.readByte(0x4FFF)).toEqual(0xAB);
		expect(RAM.readByte(0x5000)).toEqual(0x00);
		expect(RAM.readByte(0x2000)).toEqual(0x00);
		expect(RAM.readByte(0x6000)).toEqual(0x00);
		expect(RAM.readByte(0x2FFF)).toEqual(0x00);
	})

	it("loads 16KB to a specific address", function(){
		RAM = new NEScript.RAM(0x10000);
		var testData = new Array(0x4000);
		//testData.fill(0xAB);
		for(var i = 0; i < testData.length; i++){
			testData[i] = 0xAB;
		}

		RAM.loadBank16KB(0x3000, testData);
		expect(RAM.readByte(0x3000)).toEqual(0xAB);
		expect(RAM.readByte(0x3010)).toEqual(0xAB);
		expect(RAM.readByte(0x5200)).toEqual(0xAB);
		expect(RAM.readByte(0x6FFF)).toEqual(0xAB);
		expect(RAM.readByte(0x7000)).toEqual(0x00);
		expect(RAM.readByte(0x2000)).toEqual(0x00);
		expect(RAM.readByte(0x8000)).toEqual(0x00);
		expect(RAM.readByte(0x2FFF)).toEqual(0x00);
	})

	it("implements Array#slice", function(){
		RAM = new NEScript.RAM(0x10000);
		RAM.writeWord(40, 0xFACE);
		RAM.writeWord(42, 0xBEAD);
		var testSlice = RAM.slice(40, 44);
		expect(testSlice.length).toEqual(4);
		expect(testSlice[0]).toEqual(0xCE);
		expect(testSlice[3]).toEqual(0xBE);
	})

	it("records the last address written to", function(){
		RAM = new NEScript.RAM(0x10000);
		RAM.writeByte(0xFACE, 0xAB);
		expect(RAM.lastWrite).toEqual(0xFACE);
		RAM.writeWord(0xABCD, 0xAB);
		expect(RAM.lastWrite).toEqual(0xABCD);
	})

	// it("records the last address read", function(){
	// 	RAM = new NEScript.RAM(0x10000);
	// 	RAM.readByte(0xFACE);
	// 	expect(RAM.lastRead).toEqual(0xFACE);
	// 	RAM.readWord(0xABCD, 0xAB);
	// 	expect(RAM.lastRead).toEqual(0xABCD);
	// })
})