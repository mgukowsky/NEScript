describe("A virtual ROM image", function(){
	it("must be in iNES format", function(){
		var a = new Uint8Array([1, 2, 3, 4, 5]);
		var b = NEScript.ROM.bind(this, a);
		expect(b).toThrowError(/Not a valid iNES file/);
	})

	it("correctly parses an iNES header", function(){
		//First 9 bytes of the SMB header
	var SMBHeader = new Uint8Array([0x4E, 0x45, 0x53, 0x1A, 0x02, 0x01, 0x01, 0x00, 0x00]);
	var testROM = new NEScript.ROM(SMBHeader);

	expect(testROM.numBanksPRG_ROM).toEqual(2);
	expect(testROM.numBanksCHR_ROM).toEqual(1);
	expect(testROM.verticalMirroring).toEqual(true);
	expect(testROM.batteryRAM).toEqual(false);
	expect(testROM.trainer).toEqual(false);
	expect(testROM.fourScreenVRAM).toEqual(false);
	expect(testROM.mapperID).toEqual(0);
	expect(testROM.numBanksPRG_RAM).toEqual(1);
	})
})