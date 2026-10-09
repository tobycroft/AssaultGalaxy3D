/**
 * Workflow Automation Scripts v2.1.0
 * Pre-built batch operations for common Cocos Creator workflows.
 * Run these scripts via the MCP server's cocos_devtools tool,
 * or directly in the Cocos Creator console.
 */

const WORKFLOWS = {
    /**
     * Batch rename nodes matching a pattern.
     * Usage: Call via MCP tool cocos_devtools with action="batch_rename"
     */
    batchRename: {
        name: "Batch Rename Nodes",
        description: "Rename all nodes matching a pattern with sequential numbering",
        params: {
            pattern: "string - regex pattern to match node names",
            newBase: "string - base name for renamed nodes",
            startIndex: "number - starting index (default: 1)",
            padding: "number - zero-padding for numbers (default: 2)"
        },
        script: `
// Find and rename nodes
const nodes = scene.findNodesByName(/PATTERN/);
nodes.forEach((node, i) => {
    const index = (START_INDEX + i).toString().padStart(PADDING, '0');
    node.name = 'NEW_BASE_' + index;
});
return { renamed: nodes.length, names: nodes.map(n => n.name) };
`
    },

    /**
     * Batch add component to multiple nodes.
     */
    batchAddComponent: {
        name: "Batch Add Component",
        description: "Add a specific component to all nodes of a given type",
        params: {
            nodeType: "string - node type filter (e.g., 'Sprite', 'Node')",
            componentType: "string - component class name to add",
            componentProperties: "object - initial property values"
        },
        script: `
const nodes = scene.findAllNodes(n => n.getComponent('NODE_TYPE') != null);
const results = [];
nodes.forEach(node => {
    try {
        const comp = node.addComponent('COMPONENT_TYPE');
        if (comp && PROPERTIES) {
            Object.assign(comp, PROPERTIES);
        }
        results.push({ node: node.name, status: 'ok' });
    } catch(e) {
        results.push({ node: node.name, status: 'error', error: e.message });
    }
});
return { total: nodes.length, results };
`
    },

    /**
     * Batch set property on multiple components.
     */
    batchSetProperty: {
        name: "Batch Set Property",
        description: "Set the same property on all components of a specific type",
        params: {
            componentType: "string - component class to target",
            propertyName: "string - property name to set",
            propertyValue: "any - value to set",
            nodeFilter: "string (optional) - regex to filter node names"
        },
        script: `
const nodes = scene.findAllNodes(n => {
    if (NODE_FILTER && !NODE_FILTER.test(n.name)) return false;
    return n.getComponent('COMPONENT_TYPE') != null;
});
const results = [];
nodes.forEach(node => {
    const comp = node.getComponent('COMPONENT_TYPE');
    try {
        comp.PROPERTY_NAME = PROPERTY_VALUE;
        results.push({ node: node.name, old: null, new: PROPERTY_VALUE, status: 'ok' });
    } catch(e) {
        results.push({ node: node.name, status: 'error', error: e.message });
    }
});
return { updated: results.filter(r => r.status === 'ok').length, results };
`
    },

    /**
     * Clean up unused components.
     */
    cleanUnusedComponents: {
        name: "Clean Up Unused Components",
        description: "Find and optionally remove components that are effectively disabled or empty",
        params: {
            dryRun: "boolean - if true, only report what would be removed (default: true)",
            componentTypes: "string[] - component types to check (optional)"
        },
        script: `
const types = COMPONENT_TYPES || ['cc.Sprite', 'cc.Label', 'cc.Button'];
const findings = [];
scene.findAllNodes().forEach(node => {
    types.forEach(typeName => {
        const comp = node.getComponent(typeName);
        if (comp && comp.enabled === false && !comp.spriteFrame) {
            findings.push({ node: node.name, component: typeName, reason: 'disabled and empty' });
        }
    });
});
if (!DRY_RUN) {
    findings.forEach(f => {
        const node = scene.findNodeByName(f.node);
        if (node) {
            const comp = node.getComponent(f.component);
            if (comp) node.removeComponent(comp);
        }
    });
}
return { findings, removed: DRY_RUN ? 0 : findings.length };
`
    },

    /**
     * Asset usage report.
     */
    assetUsageReport: {
        name: "Asset Usage Report",
        description: "Generate a report of which assets are used where in the scene",
        params: {
            assetType: "string - filter by asset type (optional): 'texture', 'audio', 'prefab', 'material'"
        },
        script: `
const report = { textures: {}, audio: {}, prefabs: {}, materials: {}, unused: [] };

// Scan all sprite references
scene.findAllNodes().forEach(node => {
    const sprite = node.getComponent('cc.Sprite');
    if (sprite && sprite.spriteFrame) {
        const uuid = sprite.spriteFrame._uuid || 'unknown';
        report.textures[uuid] = report.textures[uuid] || { asset: sprite.spriteFrame.name, nodes: [] };
        report.textures[uuid].nodes.push(node.name);
    }

    const button = node.getComponent('cc.Button');
    if (button && button.normalSprite) {
        const uuid = button.normalSprite._uuid || 'unknown';
        report.textures[uuid] = report.textures[uuid] || { asset: button.normalSprite.name, nodes: ['[Button.normal]'] };
    }
});

// Scan audio sources
scene.findAllNodes().forEach(node => {
    const audio = node.getComponent('cc.AudioSource');
    if (audio && audio.clip) {
        const uuid = audio.clip._uuid || 'unknown';
        report.audio[uuid] = report.audio[uuid] || { asset: audio.clip.name, nodes: [] };
        report.audio[uuid].nodes.push(node.name);
    }
});

return report;
`
    },

    /**
     * Scene complexity analysis.
     */
    sceneComplexityAnalysis: {
        name: "Scene Complexity Analysis",
        description: "Analyze scene complexity: node count, draw calls estimate, hierarchy depth",
        params: {},
        script: `
const stats = {
    totalNodes: 0,
    maxDepth: 0,
    nodesByType: {},
    componentsByType: {},
    drawCallEstimate: 0,
    deepNodes: [],
    complexHierarchies: []
};

function analyze(node, depth) {
    stats.totalNodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    // Count by type
    stats.nodesByType[node.type || 'Node'] = (stats.nodesByType[node.type || 'Node'] || 0) + 1;

    // Count components
    node._components && node._components.forEach(c => {
        const name = c.__classname__ || c.constructor?.name || 'Unknown';
        stats.componentsByType[name] = (stats.componentsByType[name] || 0) + 1;
    });

    // Estimate draw calls
    const hasRenderer = node.getComponent('cc.Sprite') ||
                        node.getComponent('cc.Label') ||
                        node.getComponent('cc.MeshRenderer');
    if (hasRenderer) stats.drawCallEstimate++;

    // Deep nodes
    if (depth > 6) stats.deepNodes.push({ name: node.name, depth });

    // Complex hierarchies (>10 children)
    if (node.children && node.children.length > 10) {
        stats.complexHierarchies.push({ name: node.name, children: node.children.length });
    }

    node.children && node.children.forEach(child => analyze(child, depth + 1));
}

const rootNodes = scene.getAllRootNodes();
rootNodes.forEach(root => analyze(root, 0));

stats.recommendations = [];
if (stats.drawCallEstimate > 50) stats.recommendations.push('High draw calls - consider sprite atlasing');
if (stats.maxDepth > 10) stats.recommendations.push('Deep hierarchy - consider flattening some groups');
if (stats.totalNodes > 500) stats.recommendations.push('High node count - consider object pooling');

return stats;
`
    },

    /**
     * Generate a health check report.
     */
    healthCheck: {
        name: "Project Health Check",
        description: "Comprehensive project health check: scenes, assets, scripts, settings",
        params: {},
        script: `
const report = {
    ok: true,
    warnings: [],
    errors: [],
    stats: {}
};

// Check scene structure
try {
    const sceneInfo = scene.getCurrentSceneInfo();
    const hierarchy = scene.getSceneHierarchy();
    const nodeCount = hierarchy.totalNodes;
    stats.nodeCount = nodeCount;

    if (nodeCount > 1000) report.warnings.push('Scene has ' + nodeCount + ' nodes - consider optimization');
    if (hierarchy.maxDepth > 12) report.warnings.push('Scene depth is ' + hierarchy.maxDepth + ' - very deep');
} catch(e) {
    report.errors.push('Failed to analyze scene: ' + e.message);
    report.ok = false;
}

// Check for common issues
scene.findAllNodes().forEach(node => {
    const pos = node.position;

    // Check for extreme scale
    const scale = node.scale;
    if (scale && (scale.x > 100 || scale.y > 100 || scale.z > 100)) {
        report.warnings.push('Node "' + node.name + '" has extreme scale: ' + JSON.stringify(scale));
    }

    // Check for zero scale
    if (scale && scale.x === 0 && scale.y === 0 && scale.z === 0) {
        report.warnings.push('Node "' + node.name + '" has zero scale - invisible');
    }

    // Check for NaN positions
    if (pos && (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z))) {
        report.errors.push('Node "' + node.name + '" has NaN position!');
        report.ok = false;
    }
});

return report;
`
    },

    /**
     * Export scene to JSON summary.
     */
    exportSceneSummary: {
        name: "Export Scene Summary",
        description: "Export a lightweight JSON summary of the scene structure",
        params: {
            includeComponents: "boolean - include component data (default: false)",
            outputPath: "string - file path to save the JSON"
        },
        script: `
const summary = {
    sceneName: scene.getCurrentSceneInfo().name,
    exportTime: new Date().toISOString(),
    nodes: []
};

function summarizeNode(node, depth) {
    const info = {
        name: node.name,
        depth,
        type: node.type || 'Node',
        children: [],
        components: []
    };

    if (INCLUDE_COMPONENTS) {
        node._components && node._components.forEach(c => {
            info.components.push({
                type: c.__classname__ || 'Unknown',
                enabled: c.enabled
            });
        });
    }

    node.children && node.children.forEach(child => {
        info.children.push(summarizeNode(child, depth + 1));
    });

    return info;
}

const roots = scene.getAllRootNodes();
roots.forEach(root => summary.nodes.push(summarizeNode(root, 0)));

const json = JSON.stringify(summary, null, 2);
if (OUTPUT_PATH) {
    require('fs').writeFileSync(OUTPUT_PATH, json);
}
return summary;
`
    }
};

module.exports = WORKFLOWS;
