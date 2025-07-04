function genStyle() {
return `
.mykanban-column {
    height: 100%;
    display: inline-flex;
    flex-direction: column;
    margin-right: 15px;
    max-width: 550px;
}

.mykanban-column h2 {
    background-color: var(--ls-tertiary-background-color);
    text-align: center;
}

.mykanban-card {
    display: flex;
    flex-direction: column;
    margin-top: 5px;
    padding: 10px;
    border-radius: 5px;
    border: 2px solid var(--accent-dark-color);
    width: 100%;
}

.mykanban-card .mykanban-card-properties {
    display: flex;
    flex-direction: row;
}

.mykanban-card span {
    border-radius: 2px;
    width: fit-content;
    padding: 3px;
    margin-right: 5px;
    font-size: 0.9rem;
}

.mykanban-deadline {
    color: var(--ls-secondary-text-color);
}

.mykanban-subtasks {
    display: flex;
    flex-direction: column;
    margin-left: 20px;
}

.mykanban-subtasks li {
    margin-top: 2px;
    margin-bottom: 0px;
}
`
}

async function getCardHTML(task, tagsmap) {
    var desc = task.content
                .substring(task.marker.length + 1) // Remove action
                .replace(/#[a-zA-Z]+/g, "") // Remove tag strings
    const properties = []
    for (const r of task.refs) {
        // Add span for each tag
        if (!tagsmap.has(r.id))
            continue
        const dets = tagsmap.get(r.id)
        properties.push(`<span style="background-color: var(--rx-${dets.color}-07);">${dets.name}</span>`)
    }
    // Get deadline
    if (task.deadline) {
        const dets = desc.split("\n")
        const deadline = dets[1].replace("DEADLINE: ", "")
        properties.push(`<span class="mykanban-deadline">${deadline}</span>`)
        desc = dets[0]
    }
    // Get schedule
    if (task.scheduled) {
        const dets = desc.split("\n")
        const scheduled = dets[1].replace("SCHEDULED: ", "")
        properties.push(`<span class="mykanban-deadline">${scheduled}</span>`)
        desc = dets[0]
    }
    const subtasks = []
    const withchildren = await logseq.Editor.getBlock(task.id, {includeChildren: true})
    for (const child of withchildren.children) {
        if (child.marker == "TODO")
            subtasks.push(`<li>${child.content.substring(5)}</li>`)
        else if (child.marker == "DOING")
            subtasks.push(`<li><b>DOING</b> ${child.content.substring(6)}</li>`)
        else if (child.marker == "DONE")
            subtasks.push(`<li><s>${child.content.substring(5)}</s></li>`)
    }

    html = `
<div class="mykanban-card" data-on-click="openTask" data-page="${task.page.name}" data-block="${task.uuid}">
    <p>${desc}</p>
    <div class="mykanban-card-properties">
        ${properties.join("\n")}
    </div>
    <ul class="mykanban-subtasks">
        ${subtasks.join("\n")}
    </ul>
</div>`

    for (const r of task.refs) {
        // Add span for each tag
        if (!tagsmap.has(r.id))
            continue
        if (task.marker == "TODO")
            tagsmap.get(r.id).todo.push(html)
        else if (task.marker == "DOING")
            tagsmap.get(r.id).doing.push(html)
    }
}

function main() {
    logseq.Editor.registerSlashCommand("MyKanban", (e) => {
        logseq.Editor.insertAtEditingCursor(`{{renderer :mykanban_${e.uuid}}}`)
    })

    logseq.provideStyle(genStyle())
    logseq.provideModel({
        openTask(e) {
            const {page, block} = e.dataset
            logseq.App.pushState("page", {name: page}, {anchor: `block-content-${block}`})
        }
    })

    logseq.App.onMacroRendererSlotted(async ({slot, payload}) => {
        const uuid = payload.uuid
        const [type] = payload.arguments
        if (!type) return
        const kanbanId = `mykanban_${uuid}_${slot}`
        if (!type.startsWith(':mykanban_')) return

        const blk = await logseq.Editor.getBlock(uuid, {includeChildren: true})
        if (!blk || !blk.children || blk.children.length === 0) return

        const refsblk = blk.children[0]
        const tasks = await logseq.DB.q(`(and (task TODO DOING) (or ${refsblk.content}))`)

        // const colors = ["green", "blue", "red", "yellow", "purple", "pink", "grey"]
        const colors = ["tomato", "blue", "mint", "bronze", "cyan", "crimson", "amber", "violet", "sky", "slate", "green", "yellow", "teal", "grass", "sage", "pink", "olive", "sand", "gray", "mauve", "gold", "brown", "red", "orange", "lime", "purple"]
        const tagsmap = new Map()
        for (const ref of refsblk.refs) {
            const tagpage = await logseq.Editor.getPage(ref.id)
            tagsmap.set(ref.id, {color: colors.shift(), name: tagpage.originalName, todo: [], doing: []});
        }

        for (const t of tasks) {
            // No tag must mean this is a subtask
            // There is always 1 ref of marker, more refs indicate tag
            if (t.refs.length == 1) continue

            refid = null
            for (const r of t.refs) {
                if (tagsmap.has(r.id)) {
                    refid = r.id
                    break
                }
            }
            await getCardHTML(t, tagsmap)
        }

        todohtml = ""
        doinghtml = ""
        for (const ref of refsblk.refs) {
            dets = tagsmap.get(ref.id)
            if (dets.todo.length != 0) {
                todohtml += `<h2>${dets.name}</h2>
                    ${dets.todo.join('\n')}`
            }
            if (dets.doing.length != 0) {
                doinghtml += `<h2>${dets.name}</h2>
                    ${dets.doing.join('\n')}`
            }
        }

        const html = `
<div class="mykanban-column">
    <h2>TODO</h2>
    ${todohtml}
</div>
<div class="mykanban-column">
    <h2>DOING</h2>
    ${doinghtml}
</div>
`
        logseq.provideUI({key: kanbanId, slot, reset: true, template: html})
    })
}

// bootstrap
logseq.ready(main).catch(console.error)
