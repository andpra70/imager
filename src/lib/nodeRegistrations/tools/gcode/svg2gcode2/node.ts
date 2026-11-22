import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, notifyGraphStateChange } from "../../shared";
import { SvgToGcodeToolNode } from "../nodes";

type Svg2Gcode2Node = PreviewAwareNode & Svg2Gcode2ToolNode;

export class Svg2Gcode2ToolNode extends SvgToGcodeToolNode {
  constructor() {
    super();
    const node = this as unknown as Svg2Gcode2Node;
    node.title = createToolTitle("GCode/SVG2GCode2");
    node.properties.toolsColors = false;
    node.properties.pressure = false;
    node.properties.pressureLevels = 8;
    node.addWidget("toggle", "Tools-colors", false, value => {
      node.properties.toolsColors = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Pressure", false, value => {
      node.properties.pressure = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Pressure levels", 8, value => {
      node.properties.pressureLevels = Math.max(2, Math.min(256, Math.round(Number(value))));
      notifyGraphStateChange(node);
    }, { min: 2, max: 256, step: 1, precision: 0 });
  }

  onExecute(this: Svg2Gcode2Node) {
    return super.onExecute.call(this);
  }
}
