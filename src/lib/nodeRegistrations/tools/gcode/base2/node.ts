import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, notifyGraphStateChange } from "../../shared";
import { BaseGcodeToolNode } from "../base/node";
import { baseGcodeDefaults } from "../base/model";

export class Base2GcodeToolNode extends BaseGcodeToolNode {
  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & Base2GcodeToolNode;
    node.title = createToolTitle("GCode/Base2");
    node.properties.humanize = true;
    node.properties.handWobble = baseGcodeDefaults.handWobble;
    node.properties.handScale = baseGcodeDefaults.handScale;
    node.addWidget("toggle", "Human hand", true, value => { node.properties.humanize = Boolean(value); notifyGraphStateChange(node); });
    node.addWidget("number", "Wobble mm", baseGcodeDefaults.handWobble, value => {
      node.properties.handWobble = Math.max(0, Math.min(2, Number(value)));
      notifyGraphStateChange(node);
    }, { min: 0, max: 2, step: 0.01, precision: 2 });
    node.addWidget("number", "Wobble scale mm", baseGcodeDefaults.handScale, value => {
      node.properties.handScale = Math.max(0.5, Math.min(30, Number(value)));
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 30, step: 0.5, precision: 1 });
    node.refreshPreviewLayout();
  }
}
