/**
 * AI Prompt Template Library v2.1.0
 * Curated prompt templates for Cocos Creator operations via MCP.
 * Organized by workflow category for easy discovery.
 */

const PROMPT_LIBRARY = {
    version: "2.1.0",
    categories: [
        {
            id: "scene-building",
            name: "🎬 Scene Building",
            description: "Create and manage game scenes",
            icon: "scene",
            templates: [
                {
                    id: "create-2d-scene",
                    title: "Create a Complete 2D Game Scene",
                    difficulty: "beginner",
                    prompt: `Create a new 2D game scene in Cocos Creator with the following setup:
1. Add a Canvas node with a solid color background (#1a1a2e)
2. Add a player sprite at position (0, -200) named "Player"
3. Add a ground platform at position (0, -400) named "Ground"
4. Add a UI layer with:
   - Score label (top-right, text: "Score: 0", font-size: 24)
   - Health bar (top-left, progress bar)
   - Pause button (top-right corner)
5. Set the camera to follow the player`,
                    tags: ["scene", "2d", "beginner", "game-setup"]
                },
                {
                    id: "create-ui-menu",
                    title: "Build a Main Menu Scene",
                    difficulty: "beginner",
                    prompt: `Create a main menu scene with:
1. A background image (use default bg if none specified)
2. Title text "GAME TITLE" centered at top (font-size: 48, bold)
3. Three buttons vertically centered:
   - "Start Game" (leads to game scene)
   - "Settings" (opens settings panel)
   - "Exit" (closes the game)
4. Version text at bottom-right (small, gray)
5. Smooth fade-in animation on scene load (0.5s)`,
                    tags: ["scene", "ui", "menu", "beginner"]
                },
                {
                    id: "setup-3d-scene",
                    title: "Set Up a 3D Scene",
                    difficulty: "intermediate",
                    prompt: `Set up a 3D game scene:
1. Add a directional light (rotation: 45, -30, 0, intensity: 1.2)
2. Add an ambient light (color: #333344, intensity: 0.3)
3. Add a ground plane (MeshRenderer with default material, scale: 10, 1, 10)
4. Add a player capsule at position (0, 1, 0)
5. Add a camera at (0, 5, -10) looking at (0, 1, 0)
6. Add 5 scattered cube obstacles at random positions within (-8,0,-8) to (8,0,8)
7. Add a skybox`,
                    tags: ["scene", "3d", "intermediate", "lighting"]
                }
            ]
        },
        {
            id: "ui-building",
            name: "🖼️ UI Building",
            description: "Create and style user interfaces",
            icon: "ui",
            templates: [
                {
                    id: "inventory-panel",
                    title: "Create an Inventory Panel",
                    difficulty: "intermediate",
                    prompt: `Build an inventory UI panel:
1. Create a panel background (semi-transparent dark, rounded corners)
2. Add a grid layout with 4x5 inventory slots
3. Each slot is a 64x64 square with a dark border and semi-transparent fill
4. Add drag-and-drop support between slots
5. Add an "Inventory" title at the top
6. Add a close button (X) at top-right
7. Add item count badge on each slot
8. Animate panel opening with a scale-up effect (0.3s)`,
                    tags: ["ui", "inventory", "panel", "intermediate"]
                },
                {
                    id: "dialog-system",
                    title: "Dialog / Chat System UI",
                    difficulty: "intermediate",
                    prompt: `Create a dialog/chat UI system:
1. Panel anchored to bottom of screen, 80% width, 25% height
2. Character name label at top-left of panel
3. Dialog text area (RichText) with typewriter effect
4. Character portrait/avatar on the left side
5. "Next" indicator (animated arrow) when text is complete
6. Choice buttons (2-4 options) that appear when dialog has choices
7. Smooth slide-up animation when showing, slide-down when hiding`,
                    tags: ["ui", "dialog", "text", "animation"]
                },
                {
                    id: "hud-system",
                    title: "Game HUD / Heads-Up Display",
                    difficulty: "beginner",
                    prompt: `Create a complete game HUD:
1. Top-left: Health bar (red fill, dark background, white border) with numeric display
2. Top-left below health: Mana/Energy bar (blue fill) with numeric display
3. Top-right: Score display with icon
4. Top-right below score: Level/Stage indicator
5. Bottom-center: Ability cooldown icons (3-4 buttons in a row)
6. Bottom-left: Virtual joystick (if mobile)
7. All elements should be on a UI layer that stays fixed in screen space`,
                    tags: ["ui", "hud", "beginner", "game-ui"]
                }
            ]
        },
        {
            id: "animation",
            name: "✨ Animation & Effects",
            description: "Create animations and visual effects",
            icon: "animation",
            templates: [
                {
                    id: "character-idle",
                    title: "Character Idle Animation",
                    difficulty: "beginner",
                    prompt: `Create a character idle animation:
1. Add an Animation component to the character node
2. Create an "idle" animation clip (looping)
3. Add a subtle breathing scale animation (0.95 to 1.05, 2s cycle, ease in-out)
4. Add a slight vertical bob (up 2px, 2s cycle)
5. Add a blink/dim effect on a child "eyes" node (every 3-5 seconds)
6. Set the animation to play on load`,
                    tags: ["animation", "character", "idle", "beginner"]
                },
                {
                    id: "ui-transition",
                    title: "UI Transition Animations",
                    difficulty: "beginner",
                    prompt: `Create smooth UI transition animations:
1. Panel open: scale from 0.8 to 1.0 + fade in (0.3s, ease-out)
2. Panel close: scale from 1.0 to 0.9 + fade out (0.2s, ease-in)
3. Button hover: scale to 1.05 (0.1s)
4. Button press: scale to 0.95 (0.05s)
5. Page transition: slide left out + slide right in (0.4s)
6. Toast notification: slide down from top + auto-fade after 2s`,
                    tags: ["animation", "ui", "transition", "beginner"]
                },
                {
                    id: "particle-effects",
                    title: "Particle Effects Collection",
                    difficulty: "advanced",
                    prompt: `Create particle effect presets:
1. Explosion effect: burst of orange/red particles, expanding outward, short lifetime (0.5s)
2. Coin collect: small yellow particles burst upward in an arc
3. Level up: golden particles spiral upward around the character
4. Damage flash: character briefly flashes red (0.1s)
5. Teleport: blue particles converge inward, then outward at new position
6. Trail effect: particles follow behind moving object, fading over time`,
                    tags: ["animation", "particle", "effects", "advanced"]
                }
            ]
        },
        {
            id: "component-config",
            name: "🔧 Component Configuration",
            description: "Configure components and properties",
            icon: "component",
            templates: [
                {
                    id: "physics-setup",
                    title: "2D Physics Setup",
                    difficulty: "intermediate",
                    prompt: `Set up 2D physics for a platformer:
1. Enable 2D physics in project settings
2. Add RigidBody2D to the player (Dynamic type, fixed rotation)
3. Add BoxCollider2D to the player (match sprite size)
4. Add RigidBody2D to ground/platforms (Static type)
5. Add BoxCollider2D to all platforms
6. Set gravity to (0, -980) in physics settings
7. Configure collision matrix for player-vs-enemy and player-vs-collectible`,
                    tags: ["component", "physics", "2d", "intermediate"]
                },
                {
                    id: "button-setup",
                    title: "Interactive Button with States",
                    difficulty: "beginner",
                    prompt: `Create an interactive button with full state management:
1. Add Button component to the node
2. Set up Normal state (default sprite)
3. Set up Hover state (slightly brighter sprite, scale 1.05)
4. Set up Pressed state (slightly darker sprite, scale 0.95)
5. Set up Disabled state (grayed out sprite)
6. Add click sound effect
7. Add Transition component for smooth state switching
8. Wire up the onClick event to trigger the appropriate action`,
                    tags: ["component", "button", "ui", "beginner"]
                },
                {
                    id: "scroll-list",
                    title: "Scrollable List / ScrollView",
                    difficulty: "intermediate",
                    prompt: `Create a scrollable item list:
1. Add ScrollView component to a panel
2. Set up viewport with mask
3. Add content node with Layout component (vertical, spacing 8px)
4. Create item template/prefab for list items
5. Configure scrollbar (vertical, auto-hide)
6. Add inertia scrolling with bounce effect
7. Implement item click/selection highlighting
8. Add scroll-to-top and scroll-to-bottom buttons`,
                    tags: ["component", "scrollview", "list", "intermediate"]
                }
            ]
        },
        {
            id: "prefab-management",
            name: "📦 Prefab Management",
            description: "Create and manage prefabs",
            icon: "prefab",
            templates: [
                {
                    id: "character-prefab",
                    title: "Create a Character Prefab",
                    difficulty: "intermediate",
                    prompt: `Create a reusable character prefab:
1. Root node "Character" with:
   - Sprite component for the body
   - RigidBody2D for physics
   - BoxCollider2D for collision
   - Animation component for animations
2. Child node "HealthBar" (floating health bar)
3. Child node "WeaponSlot" (empty mount point)
4. Child node "Effects" (for hit sparks, etc.)
5. Expose configurable properties: moveSpeed, jumpForce, maxHealth
6. Add a Character script component with basic movement logic`,
                    tags: ["prefab", "character", "game-object", "intermediate"]
                },
                {
                    id: "bullet-prefab",
                    title: "Projectile / Bullet Prefab",
                    difficulty: "beginner",
                    prompt: `Create a projectile prefab with:
1. Sprite component for the projectile visual
2. RigidBody2D (Kinematic) for movement
3. Collider that triggers on contact
4. Auto-destroy script (destroy after 3s or on collision)
5. Trail particle effect behind the projectile
6. Configurable properties: speed, damage, direction
7. Impact effect prefab reference (spawned on hit)`,
                    tags: ["prefab", "projectile", "beginner", "game-object"]
                }
            ]
        },
        {
            id: "debugging",
            name: "🐛 Debugging & Diagnostics",
            description: "Debug, analyze, and optimize projects",
            icon: "debug",
            templates: [
                {
                    id: "scene-audit",
                    title: "Full Scene Audit",
                    difficulty: "advanced",
                    prompt: `Perform a full audit of the current scene:
1. List all nodes with their hierarchy depth
2. Count nodes per type (Sprite, Button, Label, etc.)
3. Identify nodes without any component
4. Find nodes with missing sprite frames or materials
5. Check for excessively large textures (>2048px)
6. Report nodes with high draw calls (complex hierarchy)
7. List all active scripts and their update frequency
8. Identify unused assets referenced nowhere
9. Report total vertex count and draw calls
10. Suggest optimization opportunities`,
                    tags: ["debug", "audit", "optimization", "advanced"]
                },
                {
                    id: "fix-common-issues",
                    title: "Fix Common Scene Issues",
                    difficulty: "intermediate",
                    prompt: `Scan and fix common issues in the current scene:
1. Find and fix nodes at position (0,0,0) that should be elsewhere
2. Identify overlapping UI elements
3. Find nodes with scale (0,0,0) or very large scale values
4. Check for components with missing references (null sprite frames, materials, etc.)
5. Verify all button onClick targets are valid
6. Find animation clips referencing deleted nodes
7. Check prefab instances that have broken prefab links`,
                    tags: ["debug", "fix", "cleanup", "intermediate"]
                }
            ]
        },
        {
            id: "asset-management",
            name: "🗂️ Asset Management",
            description: "Organize and manage project assets",
            icon: "asset",
            templates: [
                {
                    id: "organize-assets",
                    title: "Organize Project Assets",
                    difficulty: "beginner",
                    prompt: `Help me organize my project assets structure:
1. List all assets in the assets/ directory grouped by type
2. Suggest a folder structure:
   - textures/ (sprites, backgrounds, ui)
   - audio/ (music, sfx)
   - prefabs/ (characters, items, ui)
   - animations/ (clips, controllers)
   - scripts/ (by module)
   - scenes/ (by game section)
   - materials/
   - fonts/
3. Move mislocated assets to appropriate folders
4. Update all references after moving
5. Remove duplicate or unused assets`,
                    tags: ["asset", "organization", "cleanup", "beginner"]
                }
            ]
        },
        {
            id: "workflow-automation",
            name: "⚡ Workflow Automation",
            description: "Batch operations and automation scripts",
            icon: "workflow",
            templates: [
                {
                    id: "batch-rename",
                    title: "Batch Rename Nodes",
                    difficulty: "beginner",
                    prompt: `Batch rename nodes in the current scene:
1. Find all nodes matching a naming pattern [specify pattern]
2. Rename them following a convention: [specify convention, e.g., "Enemy_01", "Enemy_02"]
3. Update any script references to renamed nodes
4. Report the changes made`,
                    tags: ["workflow", "batch", "rename", "beginner"]
                },
                {
                    id: "batch-component",
                    title: "Batch Add/Modify Components",
                    difficulty: "intermediate",
                    prompt: `Batch operation on multiple nodes:
1. Find all nodes of type [specify type, e.g., "Sprite"]
2. Add component [specify component] to each
3. Set property [property name] to [value] on all
4. Verify the changes
5. Report any nodes that failed or were skipped`,
                    tags: ["workflow", "batch", "component", "intermediate"]
                },
                {
                    id: "generate-level",
                    title: "Procedural Level Generation",
                    difficulty: "advanced",
                    prompt: `Generate a level procedurally:
1. Set up a tilemap/grid system
2. Define level dimensions [width x height]
3. Place ground tiles at the bottom
4. Add platforms at varying heights
5. Place enemy spawn points (marked with placeholder nodes)
6. Add collectible items scattered across platforms
7. Place start and end/exit points
8. Ensure all platforms are reachable (pathfinding validation)
9. Add background decorations`,
                    tags: ["workflow", "generation", "level", "advanced"]
                }
            ]
        }
    ]
};

module.exports = PROMPT_LIBRARY;
