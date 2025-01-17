import { Protobuf } from "../index.js";
import crc16ccitt from "crc/calculators/crc16ccitt";

//if counter > 35 then reset counter/clear/error/reject promise
type XModemProps = (toRadio: Uint8Array, id?: number) => Promise<number>;

export class XModem {
  private sendRaw: XModemProps;
  private rxBuffer: Uint8Array[];
  private txBuffer: Uint8Array[];
  private textEncoder: TextEncoder;
  private counter: number;
  private fileContentReceived: boolean;
  private fileTransferInProgress: boolean;

  constructor(sendRaw: XModemProps) {
    this.sendRaw = sendRaw;
    this.rxBuffer = [];
    this.txBuffer = [];
    this.textEncoder = new TextEncoder();
    this.counter = 0;
    this.fileContentReceived = false;
    this.fileTransferInProgress = false;
  }

  async downloadFile(filename: string): Promise<string> {
    console.log("XModem - getFile");
    console.log(filename);

    // Send command to start file transfer
    this.fileTransferInProgress = true;
    void this.sendCommand(
      Protobuf.XModem_Control.STX,
      this.textEncoder.encode(filename),
      0
    );

    // Return a promise that will be resolved when the file content is received
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.fileContentReceived && !this.fileTransferInProgress) {
          clearInterval(interval);
          this.fileContentReceived = false;
          const fileContents = this.rxBuffer.reduce(
            (acc: Uint8Array, curr) => new Uint8Array([...acc, ...curr])
          ).reduce((acc: string, curr) => acc + String.fromCharCode(curr), "");
          resolve(fileContents);
        } else if(!this.fileTransferInProgress) {
          clearInterval(interval);
          this.fileContentReceived = false;
          resolve("__NO_FILE__");
        }
      }, 100);
    });
  }

  async uploadFile(filename: string, data: Uint8Array): Promise<number> {
    for (let i = 0; i < data.length; i += 128) {
      this.txBuffer.push(data.slice(i, i + 128));
    }

    return await this.sendCommand(
      Protobuf.XModem_Control.SOH,
      this.textEncoder.encode(filename),
      0
    );
  }

  async sendCommand(
    command: Protobuf.XModem_Control,
    buffer?: Uint8Array,
    sequence?: number,
    crc16?: number,
    // boolean for if we wait for promise or not
  ): Promise<number> {
    const toRadio = new Protobuf.ToRadio({
      payloadVariant: {
        case: "xmodemPacket",
        value: {
          buffer,
          control: command,
          seq: sequence,
          crc16: crc16
        }
      }
    });
    return this.sendRaw(toRadio.toBinary());
  }

  async handlePacket(packet: Protobuf.XModem): Promise<number> {
    console.log(`${Protobuf.XModem_Control[packet.control]} - ${packet.seq}`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    switch (packet.control) {
      case Protobuf.XModem_Control.NUL:
        // nothing
        break;
      case Protobuf.XModem_Control.SOH:
        this.counter = packet.seq;
        this.rxBuffer[this.counter] = packet.buffer;
        return this.sendCommand(Protobuf.XModem_Control.ACK);
      case Protobuf.XModem_Control.STX:
        break;
      case Protobuf.XModem_Control.EOT:
        // Notify that the file content has been received
        this.fileContentReceived = true;
        this.fileTransferInProgress = false;

        // end of transmission
        break;
      case Protobuf.XModem_Control.ACK:
        this.counter++;
        if (this.txBuffer[this.counter - 1]) {
          return this.sendCommand(
            Protobuf.XModem_Control.SOH,
            this.txBuffer[this.counter - 1],
            this.counter,
            crc16ccitt(this.txBuffer[this.counter - 1] ?? new Uint8Array())
          );
        } else if (this.counter === this.txBuffer.length + 1) {
          return this.sendCommand(Protobuf.XModem_Control.EOT);
        } else {
          this.clear();
          break;
        }
      case Protobuf.XModem_Control.NAK:
        return this.sendCommand(
          Protobuf.XModem_Control.SOH,
          this.txBuffer[this.counter],
          this.counter,
          crc16ccitt(this.txBuffer[this.counter - 1] ?? new Uint8Array())
        );
        break;
      case Protobuf.XModem_Control.CAN:
        this.clear();
        this.fileTransferInProgress = false;
        break;
      case Protobuf.XModem_Control.CTRLZ:
        break;
    }

    return Promise.resolve(0);
  }

  validateCRC16(packet: Protobuf.XModem): boolean {
    return crc16ccitt(packet.buffer) === packet.crc16;
  }

  clear() {
    this.counter = 0;
    this.rxBuffer = [];
    this.txBuffer = [];
  }
}
