import { Types } from "./";
import {
  FROMNUM_UUID,
  FROMRADIO_UUID,
  SERVICE_UUID,
  TORADIO_UUID
} from "./constants";
import { LogRecord_Level } from "./generated/mesh";
import { IMeshDevice } from "./imeshdevice";
import type { bleConnectionParameters } from "./types";
import { log, typedArrayToBuffer } from "./utils";

/**
 * Allows to connect to a meshtastic device via bluetooth
 */
export class IBLEConnection extends IMeshDevice {
  /**
   * Currently connected BLE device
   */
  device: BluetoothDevice | void;

  /**
   * Connection interface to currently connected BLE device
   */
  connection: BluetoothRemoteGATTServer | void;

  /**
   * Short Description
   */
  service: BluetoothRemoteGATTService | undefined;

  /**
   * Short Description
   */
  toRadioCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

  /**
   * Short Description
   */
  fromRadioCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

  /**
   * Short Description
   */
  fromNumCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;

  /**
   * States if the device was force disconnected by a user
   */
  userInitiatedDisconnect: boolean;

  /**
   * Queue that holds data to be written to the device, to prevent simultaneous writes
   */
  writeQueue: Uint8Array[];

  /**
   * Weather the we should currently write to the device or not, to prevent simultaneous writes
   */
  writeLock: boolean;

  /**
   * Set when a read promise has yet to be resolved, to prevent simultaneous reads.
   */
  pendingRead: boolean;

  constructor() {
    super();

    this.device = undefined;
    this.connection = undefined;
    this.service = undefined;
    this.toRadioCharacteristic = undefined;
    this.fromRadioCharacteristic = undefined;
    this.fromNumCharacteristic = undefined;
    this.userInitiatedDisconnect = false;
    this.writeQueue = [];
    this.writeLock = false;
    this.pendingRead = false;
  }

  /**
   * Initiates the connect process to a meshtastic device via bluetooth
   * @param parameters ble connection parameters
   */
  public async connect(parameters: bleConnectionParameters): Promise<void> {
    this.onDeviceStatusEvent.next(Types.DeviceStatusEnum.DEVICE_CONNECTING);
    if (!navigator.bluetooth) {
      log(
        `IBLEConnection.connect`,
        `This browser doesn't support the WebBluetooth API`,
        LogRecord_Level.WARNING
      );
    }

    this.device = await this.requestDevice(
      parameters.requestDeviceFilterParams
    );

    if (this.device) {
      this.device.gatt
        ?.connect()
        .then(async (connection) => {
          connection
            .getPrimaryService(SERVICE_UUID)
            .then(async (service) => {
              if (service) {
                this.service = service;

                await this.getCharacteristics(this.service);

                await this.subscribeToBLENotification();

                this.onDeviceStatusEvent.next(
                  Types.DeviceStatusEnum.DEVICE_CONNECTED
                );

                await this.configure();
              } else {
                log(
                  `IBLEConnection.connect`,
                  `Failed to connect, no service returned.`,
                  LogRecord_Level.ERROR
                );
              }
            })
            .catch((e) => {
              log(
                `IBLEConnection.getService`,
                e.message,
                LogRecord_Level.ERROR
              );
            });
          this.connection = connection;
        })
        .catch((e) => {
          log(`IBLEConnection.connect`, e.message, LogRecord_Level.ERROR);
        });
    }

    // if (
    //   this.device &&
    //   this.deviceStatus > Types.DeviceStatusEnum.DEVICE_RECONNECTING
    // ) {
    //   /**
    //    * @todo look into the `advertisementreceived` event
    //    */
    //   this.device.addEventListener("gattserverdisconnected", () => {
    //     this.onDeviceStatusEvent.next(
    //       Types.DeviceStatusEnum.DEVICE_DISCONNECTED
    //     );

    //     if (!this.userInitiatedDisconnect) {
    //       if (
    //         this.deviceStatus !== Types.DeviceStatusEnum.DEVICE_RECONNECTING
    //       ) {
    //         this.onDeviceStatusEvent.next(
    //           Types.DeviceStatusEnum.DEVICE_RECONNECTING
    //         );
    //       }

    //       /**
    //        * @replace with setInterval or setTimeout
    //        */

    //       //  setTimeout(() => {
    //       //   await this.connect(requestDeviceFilterParams);
    //       // }, 10000);
    //     }
    //   });
    // }
  }

  /**
   * Disconnects from the meshtastic device
   */
  public disconnect(): void {
    this.userInitiatedDisconnect = true;
    if (this.connection) {
      this.connection.disconnect();
    }
    this.onDeviceStatusEvent.next(Types.DeviceStatusEnum.DEVICE_DISCONNECTED);
  }

  /**
   * Pings device to check if it is avaliable
   * @todo implement
   */
  public async ping(): Promise<boolean> {
    return true;
  }

  /**
   * Short description
   */
  protected async readFromRadio(): Promise<void> {
    if (this.pendingRead) {
      return Promise.resolve();
    }
    this.pendingRead = true;
    let readBuffer = new ArrayBuffer(1);

    while (readBuffer.byteLength > 0 && this.fromRadioCharacteristic) {
      await this.fromRadioCharacteristic
        .readValue()
        .then((value) => {
          if (value) {
            readBuffer = value.buffer;

            if (value.byteLength > 0) {
              this.handleFromRadio(new Uint8Array(readBuffer, 0));
            }
          }
          this.onDeviceStatusEvent.next(
            Types.DeviceStatusEnum.DEVICE_CONNECTED
          );
        })
        .catch((e) => {
          readBuffer = new ArrayBuffer(0);
          log(`IBLEConnection.readFromRadio`, e.message, LogRecord_Level.ERROR);
        });
    }
    this.pendingRead = false;
  }

  /**
   * Sends supplied protobuf message to the radio
   */
  protected async writeToRadio(data: Uint8Array): Promise<void> {
    this.writeQueue.push(data);
    if (this.writeLock) {
      return Promise.resolve();
    } else {
      this.writeLock = true;
      if (this.toRadioCharacteristic) {
        while (this.writeQueue.length) {
          await this.toRadioCharacteristic
            .writeValue(typedArrayToBuffer(this.writeQueue[0]))
            .then(() => {
              this.writeQueue.shift();
            })
            .catch((e) => {
              log(
                `IBLEConnection.writeToRadio`,
                e.message,
                LogRecord_Level.ERROR
              );
            });
        }
      }
    }
  }

  /**
   * @todo, shorten
   * Opens the browsers native select device dialog, listing devices based on the applied filter
   * Later: use getDevices() to get a list of in-range ble devices that can be connected to, useful for displaying a list of devices in
   * an own UI, bypassing the browsers select/pairing dialog
   * @param requestDeviceFilterParams Bluetooth device request filters
   */
  private async requestDevice(
    requestDeviceFilterParams?: RequestDeviceOptions
  ) {
    /**
     * @todo filters does not exist on RequestDeviceOptions? look into the desired structure of the filter, currently is a union type
     */
    if (!requestDeviceFilterParams?.hasOwnProperty("filters")) {
      requestDeviceFilterParams = {
        filters: [{ services: [SERVICE_UUID] }]
      };
    }
    return navigator.bluetooth
      .requestDevice(requestDeviceFilterParams)
      .catch((e) => {
        log(`IBLEConnection.requestDevice`, e.message, LogRecord_Level.ERROR);
      });
  }
  /**
   * Short description
   * @todo wtf are some of these?
   * @param service
   */
  private async getCharacteristics(service: BluetoothRemoteGATTService) {
    this.toRadioCharacteristic = await service.getCharacteristic(TORADIO_UUID);
    log(
      `IBLEConnection.getCharacteristics`,
      `Successfully got toRadioCharacteristic.`,
      LogRecord_Level.DEBUG
    );
    this.fromRadioCharacteristic = await service.getCharacteristic(
      FROMRADIO_UUID
    );
    log(
      `IBLEConnection.getCharacteristics`,
      `Successfully got fromRadioCharacteristic.`,
      LogRecord_Level.DEBUG
    );
    this.fromNumCharacteristic = await service.getCharacteristic(FROMNUM_UUID);
    log(
      `IBLEConnection.getCharacteristics`,
      `Successfully got fromNumCharacteristic.`,
      LogRecord_Level.DEBUG
    );
  }

  /**
   * BLE notify characteristic published by device, gets called when new fromRadio is available for read
   */
  private async subscribeToBLENotification() {
    if (this.fromNumCharacteristic) {
      await this.fromNumCharacteristic.startNotifications();

      this.fromNumCharacteristic.addEventListener(
        "characteristicvaluechanged",
        async (event) => {
          await this.readFromRadio();
        }
      );
    }
  }
}
