import adb from '@devicefarmer/adbkit';
import { XMLParser } from 'fast-xml-parser';

export class AdbService {
  constructor() {
    const adbAny = adb;
    const createClient = adbAny.createClient ?? adbAny.default?.createClient;
    if (typeof createClient !== 'function') {
      throw new Error('adbkit createClient not found');
    }
    this.client = createClient();
    this.defaultSerial = undefined;
  }

  async listDevices() {
    return this.client.listDevices();
  }

  setDefaultDevice(serial) {
    this.defaultSerial = serial;
  }

  async resolveSerial(serial) {
    const target = serial ?? this.defaultSerial;
    if (target) return target;
    const devices = await this.listDevices();
    if (devices.length === 1) {
      const single = devices[0];
      this.defaultSerial = single.id;
      return single.id;
    }
    throw new Error('No device selected. Provide a serial or call selectDevice when multiple devices are attached.');
  }

  async takeScreenshot(serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    try {
      const stream = await deviceClient.screencap();
      return await this.readStreamAsBuffer(stream);
    } catch (err) {
      const stream = await deviceClient.shell('screencap -p');
      return await this.readStreamAsBuffer(stream);
    }
  }

  async sendKeyEvent(keyCode, serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    await deviceClient.shell(`input keyevent ${keyCode}`);
  }

  async tap(x, y, serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    await deviceClient.shell(`input tap ${x} ${y}`);
  }

  async inputText(text, serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    const escaped = text.replace(/ /g, '%s');
    await deviceClient.shell(`input text "${escaped}"`);
  }

  async startActivity(options, serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    await deviceClient.startActivity(options);
  }

  async uiDump(serial) {
    const { deviceClient } = await this.getDeviceClient(serial);
    const dumpCommand = 'uiautomator dump /sdcard/uidump.xml && cat /sdcard/uidump.xml && rm /sdcard/uidump.xml';
    const stream = await deviceClient.shell(dumpCommand);
    const xml = await this.readStreamAsString(stream);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
    });
    const parsed = parser.parse(xml);
    return this.normalizeUiTree(parsed?.hierarchy ?? parsed);
  }

  async getDeviceInfo(serial) {
    const { deviceClient, resolved } = await this.getDeviceClient(serial);
    const props = [
      'ro.product.model',
      'ro.product.manufacturer',
      'ro.build.version.sdk',
      'ro.product.device',
      'ro.product.name',
    ];
    const cmd = props.map((p) => `getprop ${p}`).join(' && ');
    const stream = await deviceClient.shell(cmd);
    const out = (await this.readStreamAsString(stream))
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const [model, manufacturer, sdk, device, product] = out;
    return {
      serial: resolved,
      model: model ?? '',
      manufacturer: manufacturer ?? '',
      sdk: sdk ?? '',
      device: device ?? '',
      product: product ?? '',
    };
  }

  normalizeUiTree(node) {
    if (!node) {
      return {};
    }
    const childrenArray = Array.isArray(node.node) ? node.node : node.node ? [node.node] : [];
    return {
      text: node.text,
      contentDesc: node['content-desc'],
      resourceId: node['resource-id'],
      class: node.class,
      bounds: node.bounds,
      children: childrenArray.map((child) => this.normalizeUiTree(child)),
    };
  }

  async readStreamAsString(stream) {
    const buffer = await this.readStreamAsBuffer(stream);
    return buffer.toString('utf8');
  }

  async readStreamAsBuffer(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (d) => chunks.push(d));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getDeviceClient(serial) {
    const resolved = await this.resolveSerial(serial);
    const deviceClient = this.client.getDevice(resolved);
    return { deviceClient, resolved };
  }
}


