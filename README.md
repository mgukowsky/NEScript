#NEScript
##Javascript emulator of the classic Nintendo Entertainment System (NES)
___

##UPDATE
I am now using this version of the emulator as a prototype for my more recent native Windows version of this app, which can be found [here](https://github.com/mgukowsky/MAGSNES)
##Overview
Given that the NES is more than 30 years old, a multitude of emulators of the system already exist, including many for the browser. Most of these, however, run on platforms such as flash and do not take advantage of HTML5 features. This project is an attempt to not just run NES games in JavaScript/HTML5, but to accurately mimic the low level behavior of the original NES hardware. To this end, this project features a large test suite (which can be run with 'npm test') to verify the behavior of the CPU, PPU, and other emulated components. 

The *.js files in the 'src' folder show the original OOP design of the emulator, while the *.js folders in the 'OPTIMIZED' folder (which are served on the live site) feature a more procedural design; the rationale for this will be explained below, after a summary of the emulated components.

##CPU
___
The MOS 6502 CPU used by the NES is extremely archaic by today's standards, and was already a rather dated piece of hardware  by the time the NES was released. Given that this is an 8 bit processor, Uint8Arrays underlie both the system RAM and CPU registers (with the exception of the 16 bit program counter register). 

The emulated CPU essentially JITs the original NES machine code into JavaScript instructions by implementing the following pipeline:
<ol>
<li>Check for hardware and software interrupts, then retrieve the byte (opcode) which is pointed to by the program counter (PC) register.</li>
<li>The opcode serves as an index into an array which contains information about the how to retrieve the operands and the logic to perform for the given instruction, in the form of function pointers.</li>
<li>The operands are retrieved by an "addressing mode" function, which retrieves an operand from RAM (i.e. the next byte in memory, a pointer to an absolute address, etc.). This function is also responsible for incrementing the PC.</li>
<li>The retrieved operand is passed to a function which performs a given operation with this data. This may be an operation on CPU registers, the value at a memory address, the stack, or another miscellaneous function. Each of these functions returns the number of cycles the CPU took to execute the instruction, based on the addressing mode used.</li>
</ol>