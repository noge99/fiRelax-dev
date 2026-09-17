const angstrom = 10000000000;
const Aoh_conv = 2 * Math.PI * 1000000;


$(document).ready(function () {
    const parameters = [
        { name: "q", long: "number of coordinated H2O", placeholder: "nb. of H2O. q > 0" },
        { name: "C", long: "concentration of particles m", placeholder: "Unit: mmol/L" },
        { name: "ms", long: "molar mass of the solvent", placeholder: "Unit: water: 0.01801528 kg/mol" },
        { name: "rho", long: "density of the solution", placeholder: "Unit: water: 1 kg/L" },
        { name: "S", long: "electronic spin", placeholder: "Electronic spin. Unit: Gd(III): 3.5, Mn(II): 2.5" },
        { name: "tm", long: "Lifetime of the water molecule in contact", placeholder: "Unit: s" },
        { name: "tR", long: "Rotational correlation time of the m-q*water aggregate", placeholder: "Unit: s" },
        { name: "tv", long: "Electron relaxation correlation time", placeholder: "Unit: s" },
        { name: 'Em', long: 'Activation energy for τₘ', placeholder: 'Activation energy for τₘ; Unit:(J/mol)/R' },
        { name: 'ER', long: 'Activation energy for τᵣ', placeholder: 'Activation energy for τᵣ; Unit:(J/mol)/R' },
        { name: 'Ev', long: 'Activation energy for τᵥ', placeholder: 'Activation energy for τᵥ; Unit:(J/mol)/R' },
        { name: "r", long: "Proton-Metal Distance", placeholder: "Unit: m or Å" },
        { name: "Delta2", long: "Transient ZFS", placeholder: "Unit: s-2 or cm-1" },
    ];

    const TWO_PI_c = 2 * 29979245800 * Math.PI;


    let profileCount = 1;
    let activeTabs = 1;
    const maxTabs = 10;
    const sharedState = {};
    const fixFreeState = {};
    let __syncingFixFree = false;
    let sharedTextDirty = false;
    let __progSharedUpdate = false;
    let __corrLastFitJson = null;
    const unitState = {};
    let __syncingUnits = false;

// === universal AJAX cancellation ===
    const __cancelAjax = {
        inflight: new Set(),
        register(xhr) { this.inflight.add(xhr); },
        unregister(xhr) { this.inflight.delete(xhr); },
        abortAll() {
            this.inflight.forEach(x => { try { x.abort(); } catch (_) {} });
            this.inflight.clear();
        }
    };
    $(document).ajaxSend((_e, xhr) => __cancelAjax.register(xhr));
    $(document).ajaxComplete((_e, xhr) => __cancelAjax.unregister(xhr));


    // Scope this layout for Arrhenius-only CSS overrides
    if (!document.getElementById('arrheniusTab')) {
        $('#myTabContent').wrap('<div id="arrheniusTab"></div>');
    }

    const DmodeState = { D: "X" };
    let __syncingDmode = false;


    function applyUnitStateToProfile(profileId) {
        __syncingUnits = true;
        try {
            for (const param in unitState) {
                const unit = unitState[param];
                if (!unit) continue;

                // For each parameter row matching this param
                $(`#${profileId} .parameter-input[data-param="${param}"] .param-label-dropdown`).each(function () {
                    const $menu = $(this);

                    // Update active item
                    $menu.find('.dropdown-item').removeClass('active')
                        .filter(`[data-unit="${unit}"]`).addClass('active');

                    // Update button label
                    const label = $menu.find('.dropdown-item.active').text();
                    $menu.find('button').text(label);
                });
            }
        } finally {
            __syncingUnits = false;
        }
    }

    function ensureAxisScaleUI(profileId) {
        const $box = $(`#axis-scale-${profileId}`);
        if (!$box.length || $box.data('built')) return;
        $box.data('built', true);

        const html = `
        <div class="d-flex align-items-center" style="gap:10px;">
          <div class="d-flex align-items-center" style="gap:6px;">
            <span>Y-Axis</span>
            <div class="form-check form-switch m-0">
              <input class="form-check-input axis-switch"
                     type="checkbox" data-axis="y">
            </div>
            <span>lin/log</span>
          </div>
    
          <div class="d-flex align-items-center" style="gap:6px;">
            <span>X-Axis</span>
            <div class="form-check form-switch m-0">
              <input class="form-check-input axis-switch"
                     type="checkbox" data-axis="x" checked>
            </div>
            <span>lin/log</span>
          </div>
        </div>
      `;
        $box.html(html);

        $box.on('change', '.axis-switch', function () {
            const axis = $(this).data('axis');
            const isLog = $(this).is(':checked');

            const update = {};
            update[`${axis}axis.type`] = isLog ? 'log' : 'linear';

            Plotly.relayout(`${profileId}-plot`, update);
        });
    }

    function setAxisScaleUIVisible(profileId, visible) {
        ensureAxisScaleUI(profileId);
        const $box = $(`#axis-scale-${profileId}`);
        if (visible) $box.removeClass('d-none');
        else $box.addClass('d-none');
    }

    function updateArrheniusFitQuality(profileId, fitJson, tabIdx) {
        const fitResults = fitJson && fitJson["fit-results"];
        if (typeof fitResults !== "string") return;

        const lines = fitResults.trim().split(/\r?\n/);
        // lines[0] = header
        // lines[1] = Profile 1, lines[2] = Profile 2, ...
        if (lines.length < 2) return;

        // tabIdx is 0-based (0 → Profile 1, 1 → Profile 2, ...)
        let dataLineIndex = 1; // default to first profile, just in case
        if (typeof tabIdx === "number" && tabIdx >= 0 && (tabIdx + 1) < lines.length) {
            dataLineIndex = tabIdx + 1;
        }

        const line = lines[dataLineIndex];
        if (!line) return;

        const tokens = line.split(",").map(s => s.trim());
        if (tokens.length < 4) return;

        const R2   = Number(tokens[2]);
        const chi2 = Number(tokens[3]);

        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return;

        $box.html(`
        <table>
          <tr>
            <td class="label">χ²</td>
            <td>${formatValue(chi2)}</td>
            <td class="label">R²</td>
            <td>${formatValue(R2)}</td>
          </tr>
        </table>
      `).removeClass("d-none");
    }


    function ErrorSvante(fitJson) {
        const fitResults = fitJson && fitJson['fit-results'];
        if (typeof fitResults !== 'string') {
            console.warn('[ErrorSvante] No fit-results found.');
            return;
        }

        const lines = fitResults.trim().split(/\r?\n/);
        if (lines.length < 2) {
            console.warn('[ErrorSvante] fit-results has no data rows.');
            return;
        }

        // Header row: "# TAG, Npts, R², chi2, N_1, N_2, q, ±err, C, ±err, ..."
        const header = lines[0].split(',').map(s => s.trim());

        const paramColumns = [];
        let col = header.indexOf('±err') - 1;
        if (col < 1) col = DmodeState.D === "Y" ? 7 : 6;
        while (col + 1 < header.length) {
            const backendName = header[col];
            const errLabel    = header[col + 1]; // should be "±err", not used

            if (backendName && backendName !== '±err') {
                paramColumns.push({
                    backendName,
                    valueCol: col,
                    errCol:   col + 1
                });
            }
            col += 2;
        }

        const $tabs = $('#myTabContent .tab-pane');

        $tabs.each(function (tabIdx) {
            const $tab = $(this);
            const pid  = $tab.attr('id');

            const line = lines[tabIdx + 1];
            if (!line) return;

            const cols = line.split(',').map(s => s.trim());
            if (cols.length <= 6) return;

            const fermi = $(`#fermiContactTermCheckbox-${pid}`).is(':checked');
            const mf    = $(`#modelFreeCheckbox-${pid}`).is(':checked');
            const os    = $(`#outerSphereCheckbox-${pid}`).is(':checked');

            paramColumns.forEach(({ backendName, errCol }) => {
                if (errCol >= cols.length) return;

                const rawErr = cols[errCol];

                if (!rawErr) return;
                const lower = rawErr.toLowerCase();
                if (lower === 'fixed' || lower === 'constant') return;

                const errBackend = Number(rawErr);
                if (!Number.isFinite(errBackend)) return;

                let uiName = String(backendName || '').replace(/_$/, '');
                if (Object.prototype.hasOwnProperty.call(nameMap, uiName)) {
                    uiName = nameMap[uiName];
                }

                if (uiName === 'Tref') return;

                if (!fermi && uiName === 'Aoh') return;
                if (!mf    && (uiName === 'SLS' || uiName === 'tl')) return;
                if (!os    && (uiName === 'D'   || uiName === 'a'  || uiName === 'fn')) return;

                const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
                if (!$row.length) return;

                const $errInput = $row.find('input.param-error');
                if (!$errInput.length) return;

                let errUi;
                try {
                    errUi = convForUi(uiName, errBackend, $row);
                } catch (e) {
                    console.warn(`[ErrorSvante] Conversion failed for ${uiName}`, e);
                    return;
                }

                const errNum = parseFloat(errUi);
                if (!Number.isFinite(errNum)) {
                    $errInput.val('');
                    return;
                }

                $errInput.val(
                    errNum
                        .toExponential(5)
                        .replace(/e\+?(-?\d+)/i, 'e$1')
                );
            });
        });

        console.log('[ErrorSvante] Applied errors from fit-results for all tabs.');
    }


    function applySharedStateToProfile(profileId) {
        $(`#${profileId} .shared-checkbox`).each(function () {
            const p = $(this).data('param');
            if (sharedState.hasOwnProperty(p)) {
                $(this).prop('checked', !!sharedState[p]);
            }
        });
    }

    function applyFixFreeStateToProfile(profileId) {
        __syncingFixFree = true;
        try {
            $(`#${profileId} .parameter-input`).each(function () {
                const p = String($(this).data('param') || '');
                if (!p) return;
                if (fixFreeState.hasOwnProperty(p)) {
                    const isFree = !!fixFreeState[p];
                    const $sw = $(this).find('.fix-free-switch');
                    if ($sw.length) {
                        $sw.prop('checked', isFree);
                        $sw.next('label').text(isFree ? 'Free' : 'Fix');
                    }
                }
            });
        } finally {
            __syncingFixFree = false;
        }
    }

// Broadcast a single parameter's Fix/Free state to all tabs
    function syncFixFreeAcrossTabs(paramName, isFree) {
        fixFreeState[paramName] = !!isFree;

        __syncingFixFree = true;
        try {
            $(`.parameter-input[data-param="${paramName}"]`).each(function () {
                const $row = $(this);
                $row.find('.fix-free-switch').prop('checked', isFree);
                $row.find('.fix-free-switch').next('label').text(isFree ? 'Free' : 'Fix');

                if (paramName === 'D') {
                    const $staticLabel = $row.find('.d-label-static');
                    const $dropdownLbl = $row.find('.d-label-dropdown');
                    if (isFree) { $staticLabel.show(); $dropdownLbl.hide(); }
                    else        { $staticLabel.hide(); $dropdownLbl.show(); }
                }
            });
        } finally {
            __syncingFixFree = false;
        }
    }

    function syncDistreteD(mode) {
        DmodeState.D = mode;

        __syncingDmode = true;
        try {
            $('.parameter-input[data-param="D"] .d-label-dropdown').each(function () {
                const $menu = $(this);
                $menu.find('.dropdown-item').removeClass('active')
                    .filter(`[data-mode="${mode}"]`).addClass('active');

                const text = $menu.find('.dropdown-item.active').html();
                $menu.find('button').html(text);
            });
        } finally { __syncingDmode = false; }
    }

    function applyDmodeToProfile(profileId) {
        const $row = $(`#${profileId} .parameter-input[data-param="D"]`);
        const $dropdown = $row.find('.d-label-dropdown');
        const mode = DmodeState.D;

        $dropdown.find('.dropdown-item').removeClass('active')
            .filter(`[data-mode="${mode}"]`).addClass('active');

        const text = $dropdown.find('.dropdown-item.active').html();
        $dropdown.find('button').html(text);
    }



    function formatValue(value) {
        if (typeof value === 'number' && !isNaN(value)) {
            if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) {
                return value.toExponential(4); // Convert large/small numbers to scientific notation
            } else {
                return value.toFixed(4); // Keep normal numbers readable
            }
        }
        return value !== undefined && value !== null ? String(value) : "";
    }
    // === Global sync state for section checkboxes ===
    const sectionState = {
        fermi: false,
        modelFree: false,
        outerSphere: false,
    };

    let __syncingSections = false;

// Apply the current global section state to one profile (called when a tab is created)
    function StateOfProfile(profileId) {
        __syncingSections = true;
        try {
            $(`#fermiContactTermCheckbox-${profileId}`)
                .prop("checked", !!sectionState.fermi)
                .trigger("change");

            $(`#modelFreeCheckbox-${profileId}`)
                .prop("checked", !!sectionState.modelFree)
                .trigger("change");

            $(`#outerSphereCheckbox-${profileId}`)
                .prop("checked", !!sectionState.outerSphere)
                .trigger("change");
        } finally {
            __syncingSections = false;
        }
    }

// Broadcast a single section's state to all profiles
    function syncSectionAcrossTabs(sectionKey, isChecked) {
        sectionState[sectionKey] = !!isChecked;

        __syncingSections = true;
        try {
            $(".tab-pane").each(function () {
                const pid = $(this).attr("id");
                if (sectionKey === "fermi") {
                    $(`#fermiContactTermCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                } else if (sectionKey === "modelFree") {
                    $(`#modelFreeCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                } else if (sectionKey === "outerSphere") {
                    $(`#outerSphereCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                }
            });
        } finally {
            __syncingSections = false;
        }
    }




    $('.parameter-input input[type="text"]').each(function () {
        let value = $(this).val();
        if (value !== "") {
            $(this).val(formatValue(value));
        }
    });

    function createParameterFields(profileId) {
        const parameterContainer = $(`#${profileId}`);

        // --- Layout container
        const flexContainer = `
    <div class="profile-flex">
      <div class="parameters-container" id="${profileId}-parameters" style="width: 50%;"></div>
      <div class="plots-container" id="${profileId}-plots-container" style="width: 50%; visibility: hidden;">
        <div id="${profileId}-plot" style="height: 650px; width: 800px;"></div>
      </div>
    </div>`;
        parameterContainer.append(flexContainer);

        const parametersContainer = $(`#${profileId}-parameters`);
        const SHARED_PAR = ['q','C','ms','rho','S','r','Delta2','Aoh','SLS','tl', 'El','D','a','fn'];

        // --- MAIN PARAMETER INPUTS
        parameters.forEach((param, index) => {
            const isFixedByDefault = ["q","C","ms","S","rho"].includes(param.name);
            const switchId = `switch${profileId}-${index}`;

            const minDefault = param.name === 'tm' ? 1e-11 :
                param.name === 'tv' ? 1e-12 :
                    param.name === 'tR' ? 1e-12 :
                        param.name === 'Em' ? 1e3 :
                            param.name === 'ER' ? 1e3 :
                                param.name === 'Ev' ? 1e3 : '';
            const maxDefault = param.name === 'tm' ? 1e-6 :
                param.name === 'tv' ? 1e-7 :
                    param.name === 'tR' ? 1e-7:
                        param.name === 'Em' ? 1e4 :
                            param.name === 'ER' ? 1e4 :
                                param.name === 'Ev' ? 1e4 : '';
            const valueDefault =
                param.name === 'q' ? 1 :
                    param.name === 'C' ? 1 :
                        param.name === 'rho' ? 1 :
                            param.name === 'ms' ? 0.018 :
                                param.name === 'S' ? 3.5 :
                                    param.name === 'tm' ? 1e-8 :
                                        param.name === 'tR' ? 1e-10 :
                                            param.name === 'tv' ? 1e-11 :
                                                param.name === 'Em' ? 2e3 :
                                                    param.name === 'ER' ? 3e3 :
                                                        param.name === 'Ev' ? 5e3 :
                                                            param.name === 'r' ? 3 :
                                                                param.name === 'Delta2' ? 0.03 : '';

            const sharedCheckbox = SHARED_PAR.includes(param.name)
                ? `
      <div class="form-check form-check-inline ms-1">
        <input class="form-check-input shared-checkbox" type="checkbox"
               id="${profileId}-${param.name}-shared" data-param="${param.name}">
        <label class="form-check-label" for="${profileId}-${param.name}-shared">Shared</label>
      </div>` : '';

            const noCopySelect = ['tm','Em','tR','ER','tv','Ev'].includes(param.name);
            const copySelect = noCopySelect ? '' : `
              <select class="form-select ms-2 copy-${param.name}-select narrow-select"
                      data-param="${param.name}" data-profile="${profileId}">
                <option value="indie">indie</option>
              </select>`;


            // ---- UI-only display names with subscripts (internal names unchanged)
            // subscripts: m → ₘ, r → ᵣ, v → ᵥ, n → ₙ
            let uiName = param.name;
            if (param.name === 'Delta2') uiName = 'Δ<sup>2</sup>';
            else if (param.name === 'tm') uiName = 'τ<sub>m</sub><sup>298K</sup>';
            else if (param.name === 'tR') uiName = 'τ<sub>R</sub><sup>298K</sup>';
            else if (param.name === 'tv') uiName = 'τ<sub>v</sub><sup>298K</sup>';
            else if (param.name === 'tl') uiName = 'τ<sub>l</sub><sup>298K</sup>';
            else if (param.name === 'fn') uiName = 'f<sub>n</sub>';
            else if (param.name === 'Em') uiName = 'E<sub>m</sub>';
            else if (param.name === 'ER') uiName = 'E<sub>R</sub>';
            else if (param.name === 'Ev') uiName = 'E<sub>v</sub>';

            // ---- Parameter label: plain text OR dropdown (r, Δ²)
            let paramLabelHTML = `<span class="input-group-text">${uiName}</span>`;

            if (param.name === "r") {
                paramLabelHTML = `
        <div class="input-group-text dropdown param-label-dropdown">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            r [Å]
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item active" href="#" data-unit="A">r [Å]</a></li>
            <li><a class="dropdown-item" href="#" data-unit="m">r [m]</a></li>
          </ul>
        </div>`;
            } else if (param.name === "Delta2") {
                // show Δ² in button + menu items
                paramLabelHTML = `
        <div class="input-group-text dropdown param-label-dropdown">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            Δ² [cm⁻¹]
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#" data-unit="s-2">Δ² [s⁻²]</a></li>
            <li><a class="dropdown-item active" href="#" data-unit="cm-1">Δ² [cm⁻¹]</a></li>
            <li><a class="dropdown-item" href="#" data-unit="ts0">ts0</a></li>
          </ul>
        </div>`;
            }

            const row = `
      <div class="parameter-input mb-3" data-param="${param.name}">
        <div class="input-group">
          ${paramLabelHTML}
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="${switchId}" data-param-index="${index}" ${isFixedByDefault ? "" : "checked"}>
              <label class="form-check-label ms-2" for="${switchId}">
                ${isFixedByDefault ? "Fix" : "Free"}
              </label>
            </div>
          </span>
          <input type="text" class="form-control param-value" placeholder="${param.long}"
                 title="${param.placeholder}" data-bs-toggle="tooltip" value="${valueDefault}">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="${minDefault}">
          <input type="text" class="form-control param-max" placeholder="max" value="${maxDefault}">
        </div>
        ${sharedCheckbox}
        ${copySelect}
      </div>`;
            parametersContainer.append(row);
        });

        // --- SECTION CHECKBOXES (each as const)
        const fermiCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="fermiContactTermCheckbox-${profileId}">
      <label class="form-check-label" for="fermiContactTermCheckbox-${profileId}">
        Fermi Contact Term
      </label>
    </div>
    <div id="dynamicParametersContainer-${profileId}"></div>`;
        parametersContainer.append(fermiCheckboxHTML);

        const modelFreeCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="modelFreeCheckbox-${profileId}">
      <label class="form-check-label" for="modelFreeCheckbox-${profileId}">
        Model-Free
      </label>
    </div>
    <div id="modelFreeParametersContainer-${profileId}"></div>`;
        parametersContainer.append(modelFreeCheckboxHTML);

        const outerSphereCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="outerSphereCheckbox-${profileId}">
      <label class="form-check-label" for="outerSphereCheckbox-${profileId}">
        Outer-Sphere
      </label>
    </div>
    <div id="outerSphereParametersContainer-${profileId}"></div>`;
        parametersContainer.append(outerSphereCheckboxHTML);
        StateOfProfile(profileId);

        $(`#fermiContactTermCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');

            // User action → broadcast to all tabs (incl. this one) and exit.
            if (!__syncingSections) {
                syncSectionAcrossTabs("fermi", isChecked);
                return;
            }

            // Sync pass → apply the DOM change locally.
            const container = $(`#dynamicParametersContainer-${profileId}`);
            if (!isChecked) {
                container.empty();
                return;
            }

            const aohHTML = `
      <div class="parameter-input mb-3" data-param="Aoh">
        <div class="input-group">
          <span class="input-group-text">Aoh</span>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchAoh-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchAoh-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="Hyperfine coupling constant. Unit: MHz" placeholder="Hyperfine coupling constant">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min">
          <input type="text" class="form-control param-max" placeholder="max">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-Aoh-shared" data-param="Aoh">
          <label class="form-check-label" for="${profileId}-Aoh-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-Aoh-select narrow-select" data-param="Aoh" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>`;
            container.html(aohHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
        });

        $(`#modelFreeCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');
            const container = $(`#modelFreeParametersContainer-${profileId}`);

            if (!__syncingSections) {
                syncSectionAcrossTabs("modelFree", isChecked);
                return;
            }

            if (!isChecked) {
                container.empty();
                return;
            }


            const modelFreeHTML = `
      <div class="parameter-input mb-3" data-param="SLS">
      <div class="input-group">
        <div class="input-group-text dropdown param-label-dropdown">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            S<sup>2</sup>
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item active" href="#" data-unit="s2">S<sup>2</sup></a></li>
            <li><a class="dropdown-item" href="#" data-unit="sls">SLS</a></li>
          </ul>
        </div>
        <span class="input-group-text p-0 switch-cell">
          <div class="form-check form-switch ms-2 me-2 my-1">
            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                   id="switchSLS-${profileId}" checked>
            <label class="form-check-label ms-2" for="switchSLS-${profileId}">Free</label>
          </div>
        </span>
        <input type="text" class="form-control param-value sls-value" title="Order parameter. Unit: SLS or S2" placeholder="Order parameter">
        <input type="text" class="form-control param-error" placeholder="Error" readonly>
        <input type="text" class="form-control param-min" placeholder="min" value="0">
        <input type="text" class="form-control param-max" placeholder="max" value="1">
      </div>
      <div class="form-check form-check-inline ms-1">
        <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-SLS-shared" data-param="SLS">
        <label class="form-check-label" for="${profileId}-SLS-shared">Shared</label>
      </div>
          <select class="form-select ms-2 copy-SLS-select narrow-select" data-param="SLS" data-profile="${profileId}">
            <option value="indie">indie</option>
          </select>
      </div>


      <div class="parameter-input mb-3" data-param="tl">
        <div class="input-group">
          <span class="input-group-text">τ<sub>l</sub><sup>298K</sup></span>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchTl-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchTl-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="Fast local reorientation time at 298K. Unit: s" placeholder="Fast local reorientation time">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="1e-12">
          <input type="text" class="form-control param-max" placeholder="max" value="1e-6">
        </div>
      </div>
      
      <div class="parameter-input mb-3" data-param="El">
    <div class="input-group">
      <span class="input-group-text">E<sub>l</sub></span>
      <span class="input-group-text p-0 switch-cell">
        <div class="form-check form-switch ms-2 me-2 my-1">
          <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                 id="switchEl-${profileId}" checked>
          <label class="form-check-label ms-2" for="switchEl-${profileId}">Free</label>
        </div>
      </span>
      <input type="text" class="form-control param-value" title="Activation energy for τₗ; Unit:(J/mol)/R" placeholder="Activation energy for τₗ">
      <input type="text" class="form-control param-error" placeholder="Error" readonly>
      <input type="text" class="form-control param-min" placeholder="min" value="1e3">
      <input type="text" class="form-control param-max" placeholder="max" value="1e4">
    </div>
  </div>`;
            container.html(modelFreeHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
        });

        $(`#outerSphereCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');
            const container = $(`#outerSphereParametersContainer-${profileId}`);

            // User action → broadcast first, then exit.
            if (!__syncingSections) {
                syncSectionAcrossTabs("outerSphere", isChecked);
                return;
            }

            // Sync pass → apply the DOM change locally.
            if (!isChecked) {
                container.empty();
                return;
            }

            const outerSphereHTML = `
      <div class="parameter-input mb-3" data-param="D">
      <div class="input-group">
    
        <span class="input-group-text d-label-static">D</span>
    
        <div class="input-group-text dropdown param-label-dropdown d-label-dropdown" style="display:none;">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
            D
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item active" href="#" data-mode="X">D-General</a></li>
            <li><a class="dropdown-item" href="#" data-mode="Y">D-Discrete</a></li>
          </ul>
        </div>
    
        <span class="input-group-text p-0 switch-cell">
          <div class="form-check form-switch ms-2 me-2 my-1">
            <input class="form-check-input fix-free-switch" type="checkbox" id="switchD-${profileId}" checked>
            <label class="form-check-label ms-2" for="switchD-${profileId}">Free</label>
          </div>
        </span>
    
        <input type="text" class="form-control param-value" value="2.4e-9" placeholder="Diffusion coefficient" title="Diffusion coefficient; Unit: m^2/s">
        <input type="text" class="form-control param-error" placeholder="Error" readonly>
        <input type="text" class="form-control param-min" placeholder="min">
        <input type="text" class="form-control param-max" placeholder="max">
      </div>
    
      <div class="form-check form-check-inline ms-1">
        <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-D-shared" data-param="D">
        <label class="form-check-label" for="${profileId}-D-shared">Shared</label>
      </div>
    
      <select class="form-select ms-2 copy-D-select narrow-select" data-param="D" data-profile="${profileId}">
        <option value="indie">indie</option>
      </select>
    </div>

      <div class="parameter-input mb-3" data-param="a">
        <div class="input-group">
          <div class="input-group-text dropdown param-label-dropdown">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              a [Å]
            </button>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item active" href="#" data-unit="A">a [Å]</a></li>
              <li><a class="dropdown-item" href="#" data-unit="m">a [m]</a></li>
            </ul>
          </div>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchA-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchA-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="distance of closest approach. Unit: m or Å" placeholder="distance of closest approach" value="3.6">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min">
          <input type="text" class="form-control param-max" placeholder="max">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-a-shared" data-param="a">
          <label class="form-check-label" for="${profileId}-a-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-a-select narrow-select" data-param="a" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>

      <div class="parameter-input mb-3" data-param="fn">
        <div class="input-group">
          <span class="input-group-text">f<sub>n</sub></span>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchFn-${profileId}">
              <label class="form-check-label ms-2" for="switchFn-${profileId}">Fix</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="fraction parameter" placeholder="fraction parameter" value="1">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="0">
          <input type="text" class="form-control param-max" placeholder="max" value="1">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-fn-shared" data-param="fn">
          <label class="form-check-label" for="${profileId}-fn-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-fn-select narrow-select" data-param="fn" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>`;
            container.html(outerSphereHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
            applyDmodeToProfile(profileId);
            // if (typeof StateOfProfile === 'function') StateOfProfile(profileId);
        });
        updateSelectOptions();
    }

    $(document).on('change', '.fix-free-switch', function () {
        const isChecked = $(this).is(':checked');
        const labelElement = $(this).next('label');

        labelElement.text(isChecked ? 'Free' : 'Fix');

        if (__syncingFixFree) return;

        const $row = $(this).closest('.parameter-input');
        const paramName = $row.data('param');
        if (!paramName) return;

        if (paramName === 'D') {
            const $staticLabel  = $row.find('.d-label-static');
            const $dropdownLbl = $row.find('.d-label-dropdown');

            if (isChecked) {
                $staticLabel.show();
                $dropdownLbl.hide();
            } else {
                $staticLabel.hide();
                $dropdownLbl.show();
            }
        }

        syncFixFreeAcrossTabs(String(paramName), isChecked);
    });

    $(document).on("input",
        '.parameter-input[data-param="Bm"] .param-value, \
         .parameter-input[data-param="Br"] .param-value, \
         .parameter-input[data-param="Bv"] .param-value, \
         .parameter-input[data-param="Bl"] .param-value',
        function () {

            const $row = $(this).closest('.parameter-input');
            const Bparam = $row.data("param");
            const val = parseFloat($(this).val());

            const map = { Bm:"tm", Br:"tR", Bv:"tv", Bl:"tl" };
            const tParam = map[Bparam];
            if (!tParam) return;

            if (!isNaN(val) && val === 0) {

                $(`.shared-checkbox[data-param="${tParam}"]`).prop("checked", false);
                sharedState[tParam] = false;

                const $sw = $(`.parameter-input[data-param="${tParam}"] .fix-free-switch`);
                $sw.prop("checked", true).next("label").text("Free");
            }
        });



    $(document).on('change', '.shared-checkbox', function () {
        const param = String($(this).data('param'));
        const isChecked = $(this).is(':checked');

        // persist global state
        sharedState[param] = !!isChecked;



        // reflect the same choice on all tabs for this param only
        $(`.shared-checkbox[data-param="${param}"]`).prop('checked', !!isChecked);
    });

    $(document).on("change", ".sls-unit-select", function () {
        const $row = $(this).closest('.parameter-input');
        const paramName = "SLS";

        const uiRaw = $row.find('.param-value').val() || "";

        // Convert UI → backend (using current unit selection)
        const backendValue = convertValueByParam($row, paramName, uiRaw);

        // Convert backend → UI display format
        const uiValue = convForUi(paramName, backendValue, $row);

        if (uiValue === '') {
            $row.find('.param-value').val('');
        } else if (Number.isFinite(uiValue)) {
            $row.find('.param-value').val(uiValue);
        } else {
            $row.find('.param-value').val(uiValue);
        }
    });

    $(document).on('click', '.d-label-dropdown .dropdown-item', function (e) {
        e.preventDefault();
        const $item = $(this);
        const mode = $item.data('mode');
        const $menu = $item.closest('.param-label-dropdown');

        $menu.find('.dropdown-item').removeClass('active');
        $item.addClass('active');
        $menu.find('button').html($item.html());

        if (__syncingDmode) return;

        syncDistreteD(mode);
    });



    function updateSelectOptions() {
        const paramNames = ["q", "C", "rho", "ms", "S", "tm", "tR", "tv", "r", "Delta2", "Aoh", "SLS", "tl", "D", "a", "fn"];
        paramNames.forEach(param => {

            $(`[class*="copy-${param}-select"]`).each(function () {
                const profileId = $(this).data('profile');
                $(this).find('option:not([value="indie"])').remove();

                for (let i = 1; i <= profileCount; i++) {
                    const sourceProfile = `profile${i}`;
                    if (sourceProfile !== profileId) {
                        $(this).append(`<option value="copy${i}">copy from ${i}</option>`);
                    }
                }
            });
        });
    }



    function updateTabSelectOptions() {
        const selectElement = $('#tab-select');
        selectElement.empty();

        $('.nav-tabs .nav-item .nav-link .tab-title .tab-name').each(function (index) {
            const tabTitle = $(this).text();
            selectElement.append(`<option value="${index + 1}">${tabTitle}</option>`);
        });
    }
    window.updateTabSelectOptions = updateTabSelectOptions;

    function copyParameterValue(fromProfile, toProfile, paramName) {
        const fromInput = $(`#${fromProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        const toInput   = $(`#${toProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        if (fromInput.length && toInput.length) {
            toInput.val(fromInput.val());
        }
    }

    $(document).on('change', '.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-SLS-select, .copy-D-select, .copy-a-select, .copy-fn-select', function () {
        const profileId     = $(this).data('profile');
        const selectedValue = $(this).val();
        const paramName     = $(this).data('param');

        if (selectedValue && selectedValue.startsWith('copy')) {
            const fromProfile = `profile${selectedValue.replace('copy', '')}`;
            copyParameterValue(fromProfile, profileId, paramName);
            $(this).val('indie'); // reset selection
        }
    });

    function getSharedParamName() {
        const list = $('.shared-checkbox:checked').map(function () {
            return String($(this).data('param'));
        }).get();
        return new Set(list);
    }

    function convertValueByParam($row, paramName, raw) {
        let v = raw;
        if (paramName === "SLS") {
            const unit = String(
                $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || 's2'
            );
            const num = parseFloat(v);
            if (!Number.isFinite(num)) return v;

            if (unit === "s2") {
                return Math.sqrt(num);
            }
            return num;
        } else if (paramName === "Delta2") {
            const unit = $row.find('.param-label-dropdown .dropdown-item.active').data('unit');
            if (unit === "cm-1") v = v ? Math.pow(parseFloat(v) * TWO_PI_c, 2) : "";
            else v = v ? parseFloat(v) : "";
        } else if (paramName === "r") {
            const unit = $row.find('.param-label-dropdown .dropdown-item.active').data('unit');
            if (unit === "A" || unit === "Å") v = v ? parseFloat(v) / angstrom : "";
            else v = v ? parseFloat(v) : "";
        } else if (paramName === "a") {
            const unit = $row.find('.param-label-dropdown .dropdown-item.active').data('unit');
            if (unit === "A" || unit === "Å") v = v ? parseFloat(v) / angstrom : "";
            else v = v ? parseFloat(v) : "";
        } else {
            v = v ? (isNaN(v) ? v : parseFloat(v)) : "";
        }
        return v;
    }


    function suffixParam($row, paramName, sharedNames) {
        const uiIsFree = $row.find('.fix-free-switch').is(':checked');

        const orig = String(paramName || '').replace(/_$/, '');
        let label = orig;

        if (orig === 'tm')      label = 'tmref';
        else if (orig === 'tR') label = 'trref';
        else if (orig === 'tv') label = 'tvref';
        else if (orig === 'tl') label = 'tlref';

        let sharedSet;
        if (sharedNames instanceof Set) {
            sharedSet = sharedNames;
        } else {
            sharedSet = new Set(
                $('.parameter-input .shared-checkbox:checked')
                    .map(function () {
                        return String($(this).closest('.parameter-input').data('param') || '');
                    })
                    .get()
                    .filter(Boolean)
                    .map(n => n.replace(/_$/, ''))
            );
        }

        const hasAnyShared = true;

        const isAlwaysShared = (
            orig === 'tm' || orig === 'tR' || orig === 'tv' || orig === 'tl' ||
            orig === 'Em' || orig === 'ER' || orig === 'Ev' || orig === 'El'
        );


        if (isAlwaysShared) {
            return { effF: (uiIsFree ? 'Free' : 'Fix'), label };
        }

        if (sharedSet.has(orig)) {
            return { effF: 'Free', label };
        }

        if (hasAnyShared && uiIsFree) {
            return { effF: 'Free', label: `${label}_` };
        }

        return { effF: uiIsFree ? 'Free' : 'Fix', label };
    }








    function indexForParam(paramName, isFermiChecked, nextIndexCounter) {
        if (paramName === "Aoh") return 13;
        const i = nextIndexCounter.value;
        if (i === 13) nextIndexCounter.value++;
        const out = nextIndexCounter.value;
        nextIndexCounter.value++;
        return out;
    }



    // $(document).on('change', '.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select, .copy-fn-select', function () {
    //     const profileId = $(this).data('profile'); // Current profile ID from the dropdown's data attribute
    //     const selectedOption = $(this).val(); // The selected dropdown option
    //     const paramName = $(this).data('param'); // The parameter name (e.g., "Aoh", "D")
    //
    //     if (selectedOption.startsWith('copy')) {
    //         const fromProfile = `profile${selectedOption.replace('copy', '')}`; // Extract the source profile ID
    //
    //         // Copy the parameter value from the source profile to the active profile
    //         copyParameterValue(fromProfile, profileId, paramName);
    //
    //         // Reset the dropdown selection back to 'indie' after copying
    //         $(this).val('indie');
    //     }
    // });



    createParameterFields('profile1');
    updateSelectOptions();

    const sharedAccordion = `
  <div id="shared-accordion-wrapper" style="width:50%; margin-top:12px;">
    <div class="accordion" id="shared-accordion">
      <div class="card">
        <div class="card-header" id="shared-heading">
          <h2 class="mb-0">
            <button class="btn btn-link btn-block text-left" type="button"
              data-toggle="collapse" data-target="#shared-collapse"
              aria-expanded="true" aria-controls="shared-collapse">
              Input Data
            </button>
          </h2>
        </div>
        <div id="shared-collapse" class="collapse show" aria-labelledby="shared-heading" data-parent="#shared-accordion">
          <div class="card-body">
            <textarea class="form-control mb-3 resizable-input narrow-input"
              id="shared-textarea"
              placeholder="Enter data for all profiles"
              style="height:100px; width:95%;"></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>`;

    $('.tabs-container').after(sharedAccordion);

    const $svanteTableWrapper = $(`
  <div id="svante-table-wrapper" style="width:50%; margin-top:12px; display:none;">
    <div id="svante-table-container"></div>
  </div>
`);

    $('#shared-accordion-wrapper').after($svanteTableWrapper);

    $('<div id="svante-two-col" class="d-flex align-items-start w-100"></div>')
        .insertAfter('.tabs-container'); // anchor row right after tabs-container
    $('#svante-two-col').append($('#shared-accordion-wrapper')).append($svanteTableWrapper);


    function updateSharedTextarea() {
        const $textarea = $('#shared-textarea');
        if ($textarea.length === 0) return;

        let text = '';
        for (let i = 1; i <= profileCount; i++) {
            text += `# TAG = Profile ${i}\n# UNIT = MHz\n<Add input here>\n\n`;
        }

        __progSharedUpdate = true;
        $textarea.val(text.trim());  // initial fill; do NOT mark dirty
        __progSharedUpdate = false;
    }


// Initialize default for first profile
    updateSharedTextarea();
    // If the user edits the textarea, stop all future auto-append behavior
    $('#shared-textarea').on('input', function () {
        if (__progSharedUpdate) return;
        sharedTextDirty = true;
    });

    function renderSvanteTable() {
        // Collect temperatures from each tab header's "additional-input"
        const temps = $('.nav-tabs .nav-link .additional-input').map(function () {
            const t = parseFloat($(this).val() || $(this).attr('placeholder') || '');
            return Number.isFinite(t) ? t : null;
        }).get().filter(t => t !== null);

        if (!temps.length) return;

        // Tref = temperature of the first tab
        const Tref = temps[0];

        // Read reference correlation times and activation energies from Profile 1
        // (tmref, trref, tvref) and (Em, ER, Ev)
        const $p1 = $('#profile1');
        const readV = (p) => parseFloat($p1.find(`.parameter-input[data-param="${p}"] .param-value`).val());

        const modelFreeActive = $p1.find(`#modelFreeCheckbox-${$p1.attr("id")}`).is(":checked");

        const tmref = readV('tm');
        const trref = readV('tR');
        const tvref = readV('tv');
        const Em    = readV('Em');
        const ER    = readV('ER');
        const Ev    = readV('Ev');
        let tlref = null;
        let El    = null;

        if (modelFreeActive) {
            tlref = readV('tl');
            El    = readV('El');
        }

        // ========== NEW GENERAL RULE: detect invalid Arrhenius pairs ==========
        function isInvalidArrhenius(Ename) {
            const $row = $p1.find(`.parameter-input[data-param="${Ename}"]`);
            if (!$row.length) return false;

            const isFreeUI   = $row.find('.fix-free-switch').is(':checked'); // true=Free, false=Fix
            const valRaw     = $row.find('.param-value').val();
            const valNum     = parseFloat(valRaw);

            return (!isFreeUI && Number.isFinite(valNum) && valNum === 0);
        }

        const invalid_tm = isInvalidArrhenius('Em');   // affects tm
        const invalid_tR = isInvalidArrhenius('ER');   // affects tR
        const invalid_tv = isInvalidArrhenius('Ev');   // affects tv
        const invalid_tl = modelFreeActive ? isInvalidArrhenius('El') : false;


        // Guard: if any required value is missing, do nothing
        if (![tmref, trref, tvref, Em, ER, Ev, Tref].every(Number.isFinite)) return;

        // Arrhenius function: τ(T) = τ_ref * exp( E * (1/T - 1/Tref) )
        const arrh = (tauRef, E, T) => tauRef * Math.exp(E * (1.0 / T - 1.0 / Tref));

        // Small formatter, consistent with the rest of the UI
        const toExp5 = (v) => {
            if (v === '' || v == null) return '';
            const n = Number(v);
            if (!isFinite(n)) return '';
            return n.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1');
        };

        // Build table HTML
        let html = `
    <table class="table table-sm table-bordered" id="svante-table" style="border:2px solid #000;">
      <thead>
        <tr>
          <th scope="col">T</th>
          <th scope="col">tm</th>
          <th scope="col">tR</th>
          <th scope="col">tv</th>
          ${modelFreeActive ? '<th scope="col">tl</th>' : ''}
        </tr>
      </thead>
      <tbody>
  `;

        temps.forEach((T) => {
            let tm, tR, tv, tl;
// -------- tm --------
            if (invalid_tm) {
                const profIdx = temps.indexOf(T) + 1;   // 1-indexed profiles
                const $p = $(`#profile${profIdx}`);
                const v = parseFloat($p.find('.parameter-input[data-param="tm"] .param-value').val());
                tm = Number.isFinite(v) ? v : null;
            } else {
                tm = arrh(tmref, Em, T);
            }

// -------- tR --------
            if (invalid_tR) {
                const profIdx = temps.indexOf(T) + 1;
                const $p = $(`#profile${profIdx}`);
                const v = parseFloat($p.find('.parameter-input[data-param="tR"] .param-value').val());
                tR = Number.isFinite(v) ? v : null;
            } else {
                tR = arrh(trref, ER, T);
            }

// -------- tv --------
            if (invalid_tv) {
                const profIdx = temps.indexOf(T) + 1;
                const $p = $(`#profile${profIdx}`);
                const v = parseFloat($p.find('.parameter-input[data-param="tv"] .param-value').val());
                tv = Number.isFinite(v) ? v : null;
            } else {
                tv = arrh(tvref, Ev, T);
            }

            // -------- tl (Model-Free only) --------
            if (modelFreeActive) {
                if (tlref == null || El == null) {
                    tl = "";
                } else if (invalid_tl) {
                    const profIdx = temps.indexOf(T) + 1;
                    const $p = $(`#profile${profIdx}`);
                    const v = parseFloat(
                        $p.find('.parameter-input[data-param="tl"] .param-value').val());
                    tl = Number.isFinite(v) ? v : null;
                } else {
                    tl = arrh(tlref, El, T);
                }
            }


            html += `
      <tr>
        <th scope="row">${T}</th>
        <td>${toExp5(tm)}</td>
        <td>${toExp5(tR)}</td>
        <td>${toExp5(tv)}</td>
        ${modelFreeActive ? `<td>${toExp5(tl)}</td>` : ''}
      </tr>
    `;
        });

        html += `</tbody></table>`;

        $('#svante-table-container').html(html);
        $('#svante-table-wrapper').show();
    }



    $('#add-tab').on('click', function () {
        if (activeTabs >= maxTabs) {
            $('#maxTabsToast').toast('show');
            return;
        }

        profileCount++;
        activeTabs++;


        const newTab = `
            <li class="nav-item">
                <span class="tab-close-btn" data-tab="${profileCount}">&times;</span>
                <a class="nav-link" id="profile${profileCount}-tab" data-toggle="tab" href="#profile${profileCount}" role="tab" aria-controls="profile${profileCount}" aria-selected="false">
                    <div class="tab-title">
                        <span id="profile${profileCount}-name">Profile ${profileCount}</span>
                        <span class="editable-profile-name" data-profile="profile${profileCount}">Edit</span>
                        <div class="dropdown-label">
                            <select class="custom-select">
                                <option value="R1" selected>R1</option>
                                <option value="R2" disabled>R2</option>
                            </select>
                        </div>
                        <input type="text" class="form-control additional-input" placeholder="T">
                    </div>
                </a>
            </li>
        `;

        const newTabContent = `
        <div class="tab-pane fade" id="profile${profileCount}" role="tabpanel" aria-labelledby="profile${profileCount}-tab">
            <div class="tab-controls-row">
                <button class="btn btn-sm btn-info toggle-parameters" data-profile="profile${profileCount}">
                    Hide System Parameters
                </button>
                <div class="fit-quality d-none" id="fit-quality-profile${profileCount}"></div>
                <div class="axis-scale d-none" id="axis-scale-profile${profileCount}"></div>
            </div>
        </div>
        `;


        $('#add-tab-container').before(newTab);
        $('#myTabContent').append(newTabContent);

        createParameterFields(`profile${profileCount}`);

// APPLY GLOBAL STATES TO THE NEW TAB
        applySharedStateToProfile(`profile${profileCount}`);
        applyFixFreeStateToProfile(`profile${profileCount}`);
        applyUnitStateToProfile(`profile${profileCount}`);
        StateOfProfile(`profile${profileCount}`);

        if (fixFreeState.hasOwnProperty("D")) {
            syncFixFreeAcrossTabs("D", fixFreeState["D"]);
        }

        $('[data-toggle="tooltip"]').tooltip();
        updateTabSelectOptions();
        applyDmodeToProfile(`profile${profileCount}`);




        (function () {
            const $textarea = $('#shared-textarea');
            if (!$textarea.length) return;

            if (sharedTextDirty) return; // user changed it → do nothing

            const i = profileCount;
            const block =
                `# TAG = Profile ${i}\n` +
                `# UNIT = MHz\n` +
                `<Add input here>\n\n`;

            const current = $textarea.val();
            const separator = current && !current.endsWith('\n\n') ? '\n\n' : '';

            __progSharedUpdate = true;
            $textarea.val((current || '') + separator + block);
            __progSharedUpdate = false;
        })();

    });

    $(document).on('click', '.tab-close-btn', function () {
        if (activeTabs === 1) {
            $('#lastTabToast').toast('show');
            return;
        }

        const tabId = $(this).data('tab');
        $(`#profile${tabId}-tab`).parent().remove();
        $(`#profile${tabId}`).remove();
        activeTabs--;

        $('.nav-tabs a:first').tab('show');

        // Remove the deleted tab from all copy dropdowns
        $(`.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select,
        .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select,
        .copy-Aoh-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select,
        .copy-fn-select`).each(function () {
            $(this).find(`option[value="copy${tabId}"]`).remove();
        });

        updateTabSelectOptions(); // Update select options after removing tab
    });

    // When any param-label dropdown opens, bring its row to the front
    $(document).on('shown.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').addClass('z-top');
    });

// When it closes, restore normal stacking
    $(document).on('hidden.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').removeClass('z-top');
    });

    $(document).on('click', '.param-label-dropdown .dropdown-item', function (e) {
        e.preventDefault();
        const $item = $(this);
        const unit  = $item.data('unit');
        const $menu = $item.closest('.param-label-dropdown');
        const $row  = $item.closest('.parameter-input');
        const param = String($row.data('param') || '');

        // set active & button label locally
        $menu.find('.dropdown-item').removeClass('active');
        $item.addClass('active');
        $menu.find('button').html($item.html());

        if (__syncingUnits) return;

        // persist + broadcast using existing state keys
        if (param === 'Delta2') unitState.Delta2 = unit;
        if (param === 'r')      unitState.r = unit;
        if (param === 'a')      unitState.a = unit;

        __syncingUnits = true;
        try {
            $(`.parameter-input[data-param="${param}"] .param-label-dropdown`).each(function () {
                const $pm = $(this);
                $pm.find('.dropdown-item').removeClass('active')
                    .filter(`[data-unit="${unit}"]`).addClass('active');
                $pm.find('button').html($pm.find('.dropdown-item.active').html());
            });
        } finally {
            __syncingUnits = false;
        }
    });

    $(document).on('click', '.toggle-parameters', function () {
        const profileId = $(this).data('profile');
        const parametersToToggle = $(`#${profileId} .parameter-input[data-param="q"], #${profileId} .parameter-input[data-param="C"], #${profileId} .parameter-input[data-param="rho"], #${profileId} .parameter-input[data-param="ms"], #${profileId} .parameter-input[data-param="S"]`);

        parametersToToggle.toggle();

        const buttonText = $(this).text() === 'Hide System Parameters' ? 'Show System Parameters' : 'Hide System Parameters';
        $(this).text(buttonText);
    });


    function applyAohLogic_corr(data, profileId, isPlotMode = false) {
        const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

        if (!isFermiChecked) {
            data["F13"]    = "Fix";
            data["Pval13"] = "0";
            data["Pmin13"] = "0";
            data["Pmax13"] = "0";
            return;
        }

        const paramDiv = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
        if (!paramDiv.length) {
            data["F13"]    = "Fix";
            data["Pval13"] = "";
            data["Pmin13"] = "";
            data["Pmax13"] = "";
            return;
        }

        const input = paramDiv.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])').val();
        const min   = paramDiv.find('input[placeholder="min"]').val();
        const max   = paramDiv.find('input[placeholder="max"]').val();

        if (isPlotMode) {
            data["F13"]    = "Fix";
            data["Pval13"] = (input !== "" ? (parseFloat(input) * Aoh_conv) : "");
            data["Pmin13"] = "";
            data["Pmax13"] = "";
        } else {
            const fixFree = paramDiv.find('.fix-free-switch').is(':checked') ? "Free" : "Fix";
            data["F13"]    = fixFree;
            data["Pval13"] = (input !== "" ? (parseFloat(input) * Aoh_conv) : "");
            data["Pmin13"] = (min   !== "" ? (parseFloat(min)   * Aoh_conv) : "");
            data["Pmax13"] = (max   !== "" ? (parseFloat(max)   * Aoh_conv) : "");
        }
    }

    function getTabNamesInOrder_corr() {
        return $('.nav-tabs .nav-link').map(function () {
            const $t = $(this);
            const name =
                $t.find('.tab-name, [id$="-name"]').first().text().trim() ||
                $t.text().trim();
            // ignore the "+" add tab button or empty entries
            return name && name !== '+' ? name : null;
        }).get();
    }

    function saveParametersForAllTabs_svante() {
        const $active = $('#myTabContent .tab-pane.active');
        const profileId = $active.attr('id');
        if (!profileId) {
            console.warn('[svante] No active tab found.');
            return Promise.reject('No active tab');
        }

        function SharedRules_svante(data, profileId) {
            const sharedParamName = getSharedParamName();
            const isFermiChecked  = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

            // Ensure Aoh (Fermi) bookkeeping is applied
            applyAohLogic_corr(data, profileId, false);
            if (isFermiChecked && (!data["Pval13"] || data["Pval13"] === "")) {
                data["Pval13"] = String(13 * Aoh_conv);
                if (!data["F13"]) data["F13"] = "Fix";
            }

            const labelsByIndex = {};
            const nextIdx = { value: 0 };

            // walk all parameter rows except Aoh (handled specially)
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const paramName = String($row.data('param') || '');

                if (paramName === 'Aoh') return; // reserved at 13

                if (paramName === "D" && DmodeState.D === "Y") return;

                const index = indexForParam(paramName, isFermiChecked, nextIdx);

                const inputElement = $row.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])');
                const minElement   = $row.find('input[placeholder="min"]');
                const maxElement   = $row.find('input[placeholder="max"]');

                let val = convertValueByParam($row, paramName, inputElement.val() || "");
                let min = convertValueByParam($row, paramName, minElement.val()   || "");
                let max = convertValueByParam($row, paramName, maxElement.val()   || "");

                // ----- ARRHENIUS INVALID PAIR -----
                const arrPairs = {
                    tm: "Em",
                    tR: "ER",
                    tv: "Ev",
                    tl: "El"
                };

                if (arrPairs.hasOwnProperty(paramName)) {
                    const energyName  = arrPairs[paramName];
                    const $energyRow  = $(`#${profileId} .parameter-input[data-param="${energyName}"]`);
                    const $tauRow     = $row;

                    const energyVal   = parseFloat($energyRow.find('.param-value').val());
                    const energyIsFree = $energyRow.find('.fix-free-switch').is(':checked'); // true = Free

                    const tauIsFree   = $tauRow.find('.fix-free-switch').is(':checked');

                    if (!energyIsFree && Number.isFinite(energyVal) && energyVal === 0) {

                        const refLabel =
                            paramName === "tm" ? "tmref" :
                                paramName === "tR" ? "trref" :
                                    paramName === "tv" ? "tvref" :
                                        "tlref";

                        data[`F${index}`]    = "Fix";
                        data[`Pval${index}`] = val;
                        data[`Pmin${index}`] = min;
                        data[`Pmax${index}`] = max;

                        labelsByIndex[index] = tauIsFree ? `${refLabel}_` : refLabel;

                        return;
                    }
                }


                const { effF, label } = suffixParam($row, paramName, sharedParamName);

                data[`F${index}`]    = effF;
                data[`Pval${index}`] = val;
                data[`Pmin${index}`] = min;
                data[`Pmax${index}`] = max;

                labelsByIndex[index] = label;

            });

            // Aoh at fixed slot 13
            const $aoh = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
            if ($aoh.length) {
                const { effF, label } = suffixParam($aoh, 'Aoh', sharedParamName);
                data['F13'] = effF;
                labelsByIndex[13] = label;
            } else {
                labelsByIndex[13] = 'Aoh';
            }

            // compact labels array up to max used index
            const used = Object.keys(labelsByIndex).map(n => parseInt(n,10)).sort((a,b)=>a-b);
            const labels = [];
            if (used.length) {
                const maxIdx = used[used.length - 1];
                for (let i = 0; i <= maxIdx; i++) {
                    labels.push(labelsByIndex.hasOwnProperty(i) ? labelsByIndex[i] : "");
                }
            }

            data["Parameters"] = labels;
            data["ParametersString"] = labels.join(", ");
        }

        const data = {};

        // active tab name
        data["ProfileName"] = $(`#${profileId}-name`).text().trim();

        // shared textarea → dados (unit-aware pre-scale)
        const $acc = $('#shared-textarea');
        let rawInput = ($acc.length ? $acc.val() : "");
        let lines = rawInput.split(/\r?\n/);

        let unitFactor = 1;
        const unitLine = lines.find(line => line.trim().toUpperCase().startsWith("# UNIT ="));
        if (unitLine) {
            const unit = unitLine.split("=")[1]?.trim().toUpperCase();
            if (unit === "MHZ") unitFactor = 1e6;
            else if (unit === "HZ") unitFactor = 1;
        }
        const processedLines = lines.map(line => {
            const t = line.trim();
            if (t === "" || t.startsWith("#")) return t;
            const parts = t.split(/\s+/);
            if (!isNaN(parseFloat(parts[0]))) {
                parts[0] = String(parseFloat(parts[0]) * unitFactor);
            }
            if (parts.length === 2) {
                const y = parseFloat(parts[1]);
                if (!isNaN(y)) {
                    parts.push(Number((0.1 * y).toPrecision(6)).toString());
                }
            }
            return parts.join(" ");
        });

        // Collect D values per dataset (per tab)
        const Dvals = {};
        if (DmodeState.D === "Y") {
            let idx = 1;
            $('.tab-pane').each(function () {
                const pid = $(this).attr('id');   // e.g. "profile1"
                const selector = `#${pid} .parameter-input[data-param="D"] .param-value`;
                const $inp = $(selector);

                let dval = "";
                if ($inp.length) dval = ($inp.val() || "").trim();

                Dvals[idx] = dval;
                idx++;
            });
        }

        function injectDataN_svante(text) {
            const lns = String(text || "").split(/\r?\n/);

            // Temperatures from tab headers (same logic as renderSvanteTable)
            const temps = $('.nav-tabs .nav-link .additional-input').map(function () {
                const raw = $(this).val() || $(this).attr('placeholder') || '';
                const t = parseFloat(raw);
                return Number.isFinite(t) ? t : null;
            }).get();

            let out = [];
            let counter = 0;

            for (let ln of lns) {
                const trimmed = ln.trim();

                if (trimmed.startsWith("# TAG")) {
                    counter++;

                    const Tval = temps[counter - 1];  // temperature for this dataset
                    const Tstr = (Tval != null && Number.isFinite(Tval)) ? String(Tval) : "";

                    // Base: "# DATA N= <T> <index>"
                    let header = `# DATA N= ${Tstr} ${counter}`;

                    // If D is discrete, append D value
                    if (DmodeState.D === "Y") {
                        const dval = Dvals[counter] || "";
                        header = `# DATA N= ${Tstr} ${counter} ${dval}`;
                    }

                    out.push(header);
                }

                out.push(ln);
            }

            return out.join("\n");
        }


        const processedText = processedLines.join("\n");
        data["dados"] = injectDataN_svante(processedText);

        const isFermiChecked       = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');
        const isModelFreeChecked   = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
        const isOuterSphereChecked = $(`#outerSphereCheckbox-${profileId}`).is(':checked');

        // Build core params (labels, F/Pval/Pmin/Pmax) via shared rules
        SharedRules_svante(data, profileId);

        // Flags
        data["ModelFree"]   = isModelFreeChecked ? "true" : "false";
        data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";

        // Tabs info
        data.AllTabs  = getTabNamesInOrder_corr();
        data.ActiveTab = $(`#${profileId}-name`).text().trim() || profileId;

        // Append trailing Tref
        if (!Array.isArray(data.Parameters)) data.Parameters = [];

        const trefRaw = ($('#profile1-tab .additional-input').val() || '').trim();
        const trefVal = trefRaw !== '' ? trefRaw : ($('#profile1-tab .additional-input').attr('placeholder') || '298');

        data.Parameters.push('Tref');

        const trefIdx  = data.Parameters.length - 1;

        // Tref (JSON-only)
        data[`F${trefIdx}`]    = 'Fix';
        data[`Pval${trefIdx}`] = trefVal;
        data[`Pmin${trefIdx}`] = '';
        data[`Pmax${trefIdx}`] = '';

        // Remove D from parameters if discrete
        if (DmodeState.D === "B" && Array.isArray(data.Parameters)) {
            data.Parameters = data.Parameters.filter(label => label !== "D");
        }



        data["ParametersString"] = data["Parameters"].join(", ");

        data["FitType"] = "Individual";

        data["Dmode_svante"] = DmodeState.D;

        // POST
        return $.ajax({
            type: 'POST',
            url: `/saveTabData_svante`,
            data: JSON.stringify(data),
            contentType: 'application/json'
        });
    }


    // Split the single shared textarea at blank-line + "# DATA ..." headers,
    function splitAtDataHeaders_corr(text) {
        const src = String(text || "").replace(/\r\n/g, "\n");
        if (!src.trim()) return [];
        return src.split(/\n\s*\n(?=#\s*DATA\b)/g).filter(s => s.trim());
    }

    function injectDataN_arrhenius(text) {
        const lines = String(text || "").split(/\r?\n/);

        // Collect temperatures from tab headers
        const temps = $('.nav-tabs .nav-link .additional-input').map(function () {
            const raw = $(this).val() || $(this).attr('placeholder') || '';
            const t = parseFloat(raw);
            return Number.isFinite(t) ? t : null;
        }).get();

        let out = [];
        let counter = 0;

        for (const ln of lines) {
            const trimmed = ln.trim();

            if (trimmed.startsWith("# TAG")) {
                counter++;

                const Tstr =
                    (temps[counter - 1] != null && Number.isFinite(temps[counter - 1]))
                        ? String(temps[counter - 1])
                        : "";

                const header = `# DATA N= ${Tstr} ${counter}`;

                out.push(header);
            }

            out.push(ln);
        }

        return out.join("\n");
    }



    function saveForPlot_svante() {

        const shared = ($('#shared-textarea').val() || "");


        // Dummy code without use
        let processedDados;
        if (!shared.trim()) {
            // no user input → let Java inject the preset block
            processedDados = "<Add input here>";
        } else {
            let lines = shared.split(/\r?\n/);
            let unitFactor = 1;

            processedDados = lines.map(line => {
                const t = line.trim();
                if (t === "") return t;

                // detect / update unit per block
                if (t.toUpperCase().startsWith("# UNIT =")) {
                    const unit = t.split("=")[1]?.trim().toUpperCase();
                    if (unit === "MHZ") unitFactor = 1e6;
                    else if (unit === "HZ") unitFactor = 1;
                    return t; // keep header as-is
                }

                if (t.startsWith("#")) return t;

                const parts = t.split(/\s+/);
                const x = parseFloat(parts[0]);
                if (!Number.isNaN(x)) parts[0] = String(x * unitFactor);
                if (parts.length === 2) {
                    const y = parseFloat(parts[1]);
                    if (!isNaN(y)) {
                        parts.push(Number((0.1 * y).toPrecision(6)).toString());
                    }
                }
                return parts.join(" ");
            }).join("\n");
        }

        const saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {

            const profileId   = $(this).attr('id');
            const profileName = $(`#${profileId}-name`).text().trim();

            const data = {};

            // Required for backend
            data["ProfileName"]  = profileName;
            data["ProfileIndex"] = tabIndex;
            data["Mode"]         = "plot";

            data["dados"] = injectDataN_arrhenius(processedDados);

            const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

            // Aoh slot 13 (value/F) in plot mode (uses same converter as fit)
            applyAohLogic_corr(data, profileId, true);

            const labelsByIndex = {};
            const nextIdx       = { value: 0 };

            // copy parameter values using the same converter as fit (Å, cm⁻¹, etc.)
            $(`#${profileId} .parameter-input`).each(function () {
                const $row      = $(this);
                const paramName = String($row.data('param') || '');

                // Aoh is handled separately in applyAohLogic_corr
                if (!paramName || paramName === 'Aoh') return;

                const index = indexForParam(paramName, isFermiChecked, nextIdx);

                const inputElement = $row.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])');
                const minElement   = $row.find('input[placeholder="min"]');
                const maxElement   = $row.find('input[placeholder="max"]');

                const valRaw = inputElement.val() || "";
                const minRaw = minElement.val()   || "";
                const maxRaw = maxElement.val()   || "";

                const val = convertValueByParam($row, paramName, valRaw);
                const min = convertValueByParam($row, paramName, minRaw);
                const max = convertValueByParam($row, paramName, maxRaw);

                data[`Pval${index}`] = val;
                data[`Pmin${index}`] = min;
                data[`Pmax${index}`] = max;
                data[`F${index}`]    = "Fix";   // all Fix in plot mode

                // label without any shared suffix / underscore
                let label = paramName;
                if (paramName === 'tm')      label = 'tmref';
                else if (paramName === 'tR') label = 'trref';
                else if (paramName === 'tv') label = 'tvref';

                labelsByIndex[index] = label;
            });

            // Aoh label always at 13 (value already set by applyAohLogic_corr)
            labelsByIndex[13] = 'Aoh';

            // compact labels array up to max used index
            const used = Object.keys(labelsByIndex).map(n => parseInt(n, 10)).sort((a, b) => a - b);
            let labels = [];
            if (used.length) {
                const maxI = used[used.length - 1];
                for (let i = 0; i <= maxI; i++) {
                    labels.push(labelsByIndex.hasOwnProperty(i) ? labelsByIndex[i] : "");
                }
            }
            data["Parameters"] = labels;
            data["ParametersString"] = labels.join(", ");

            if (!Array.isArray(data["Parameters"])) data["Parameters"] = [];

            const trefRaw = ($('#profile1-tab .additional-input').val() || '').trim();
            const trefVal = trefRaw !== '' ? trefRaw
                : ($('#profile1-tab .additional-input').attr('placeholder') || '298');

            data["Parameters"].push("Tref");

            const trefIdx = data["Parameters"].length - 1;   // Tref

            data[`F${trefIdx}`]    = "Fix";
            data[`Pval${trefIdx}`] = trefVal;
            data[`Pmin${trefIdx}`] = '';
            data[`Pmax${trefIdx}`] = '';

            // final string for backend (matches fit handler)
            data["ParametersString"] = data["Parameters"].join(", ");

            // checkboxes
            data["ModelFree"]   = $(`#modelFreeCheckbox-${profileId}`).is(':checked') ? "true" : "false";
            data["OuterSphere"] = $(`#outerSphereCheckbox-${profileId}`).is(':checked') ? "true" : "false";

            // Tags / SelectedDataSet via AllTabs/ActiveTab (used by HomeController for JSON)
            data.AllTabs   = getTabNamesInOrder_corr();
            data.ActiveTab = $(`#${profileId}-name`).text().trim() || profileId;

            data["FitType"] = "Individual";

            saveRequests.push(
                $.ajax({
                    url: `/saveTabData_svante`,
                    method: 'POST',
                    data: JSON.stringify(data),
                    contentType: "application/json"
                })
            );

            tabIndex++;
        });

        return Promise.all(saveRequests);
    }


    function missingInputToast(msg, type="info") {
        // Bootstrap 5 example; adjust to your project
        const toastEl = document.getElementById("mainToast");
        if (!toastEl) { alert(msg); return; }

        toastEl.querySelector(".toast-body").textContent = msg;
        toastEl.classList.remove("bg-info", "bg-warning", "bg-danger");
        toastEl.classList.add(type === "warning" ? "bg-warning" :
            type === "danger"  ? "bg-danger"  : "bg-info");

        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }





    function renderSamePlotEverywhere(datasetsArr, curvesArr, mode ="fit") {
        $('#myTabContent .tab-pane').each(function () {
            const pid = this.id;
            $(`#${pid}-plots-container`).css('visibility', 'visible');
            plotNewDataMulti_svante(datasetsArr, curvesArr, pid, mode);
        });
    }


    function FormatSciNumb(v) {
        if (v === "" || v === null || typeof v === "undefined") return "";
        const n = Number(v);
        if (!isFinite(n)) return String(v);
        return n.toExponential(4).replace(/e\+?(-?\d+)/i, 'e$1');
    }

    function convForUi(paramName, raw, $row) {
        if (raw === '' || raw == null) return '';
        const x = Number(raw);
        if (!Number.isFinite(x)) return '';

        // SLS: backend stores sqrt(S²); UI in S² should show S²
        if (paramName === "SLS") {
            const unitSel = String(
                $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || 's2'
            );
            if (unitSel === "s2") {
                return x * x;
            }
            // UI in "sls" → show raw backend value
            return x;
        }

        const unit = String(
            $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || ''
        );

        if (paramName === 'Delta2') {
            // backend stores Δ² in s⁻²; UI cm⁻¹ shows √(Δ²)/(2πc)
            const base = x < 0 ? 0 : x;
            return unit === 'cm-1'
                ? (Math.sqrt(base) / TWO_PI_c)
                : x;
        }

        if (paramName === 'r' || paramName === 'a') {
            // backend stores meters; UI Å shows m → Å
            return (unit === 'A' || unit === 'Å')
                ? x * angstrom
                : x;
        }

        if (paramName === "Aoh") return x / Aoh_conv;

        return x;
    }

    // name mapping from fit JSON → UI data-param names
    const nameMap = {
        tmref: 'tm',
        tvref: 'tv',
        trref: 'tR',
        tlref: 'tl'
    };


    function applyParTableToTab(tabIndex, parTables) {
        if (!parTables || !parTables[tabIndex]) return;
        const $tabs = $('#myTabContent .tab-pane');
        const $tab = $($tabs[tabIndex]);
        const entries = parTables[tabIndex];

        entries.forEach(e => {
            const uiName = String(e.name || '').replace(/_$/, '');
            if (!uiName) return;

            const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
            if (!$row.length) return;

            const $value = $row.find('input[type="text"]').filter(function () {
                const ph = $(this).attr('placeholder');
                return ph !== 'min' && ph !== 'max';
            }).first();

            // reconvert JSON → UI units before displaying
            const v    = convForUi(uiName, e.value, $row);
            const vmin = convForUi(uiName, e.min,   $row);
            const vmax = convForUi(uiName, e.max,   $row);

            if ($value.length) $value.val(v === '' ? '' : FormatSciNumb(v));
            const $min = $row.find('input[placeholder="min"]');
            const $max = $row.find('input[placeholder="max"]');
            if ($min.length) $min.val(vmin === '' ? '' : FormatSciNumb(vmin));
            if ($max.length) $max.val(vmax === '' ? '' : FormatSciNumb(vmax));
        });
    }



// Split a text blob into blocks separated by one-or-more lines that start with '#'
    function splitByHashBlocks_corr(text) {
        const lines = String(text || "").replace(/\\n/g, '\n').split('\n');
        const blocks = [];
        let current = [];

        const flush = () => {
            if (current.length) {
                blocks.push(current.join('\n'));
                current = [];
            }
        };

        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith('#')) {
                flush();
            } else if (line !== "") {
                current.push(line);
            }
        }
        flush();
        return blocks.filter(b => b.trim() !== "");
    }


    function parseDadosforPlot_corr(dadosText) {
        const blocks = splitByHashBlocks_corr(dadosText);
        return blocks.map(block => {
            const data = [];
            block.split('\n').forEach(raw => {
                const parts = raw.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    if (!Number.isNaN(x) && !Number.isNaN(y)) data.push({ x, y });
                }
            });
            return { data };
        });
    }

    // Parse a single fit-curve block: one dataset = one block
    function parseSingleFitCurveBlock_svante(block) {
        const out = [];
        const lines = block.split('\n');
        for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const parts = trimmed.split(/\s+/).map(Number).filter(n => !isNaN(n));
            if (parts.length >= 2) {
                const x = parts[0];
                // ✅ adopt _indie.js logic — always take the last numeric value as y
                const y = parts[parts.length - 1];
                out.push({ x, y });
            }
        }
        return out;
    }

// Normalize fit-curves array/string into clean blocks
    function normalizeFitCurvesBlocks_svante(fitCurves, mode) {
        if (!fitCurves) return [];

        if (mode === "compare") {
            return Array.isArray(fitCurves) ? fitCurves.slice() : [String(fitCurves)];
        }

        if (Array.isArray(fitCurves)) {
            const blocks = [];
            fitCurves.forEach(item => {
                splitByHashBlocks_corr(String(item)).forEach(b => blocks.push(b));
            });
            return blocks;
        } else {
            return splitByHashBlocks_corr(String(fitCurves));
        }
    }

// Parse multiple fit-curves blocks (main entry for plotting)
    function parseMultiFitCurves_corr(fitCurves, mode = "fit") {
        if (mode === "compare") return fitCurves;
        const blocks = normalizeFitCurvesBlocks_svante(fitCurves, mode);
        return blocks.map(parseSingleFitCurveBlock_svante);
    }

    function plotNewDataMulti_svante(datasetsArr, curvesArr, activeTabId, mode = "fit") {
        const traces = [];
        const n = Math.min(
            Array.isArray(datasetsArr) ? datasetsArr.length : 0,
            Array.isArray(curvesArr) ? curvesArr.length : 0
        );

        const temps = $('.nav-tabs .nav-link .additional-input').map(function () {
            const raw = $(this).val() || $(this).attr('placeholder') || '';
            const t = parseFloat(raw);
            return Number.isNaN(t) ? null : t;
        }).get();

        const colors = Array.from(
            { length: Math.max(n, 1) },
            (_, i) => `hsl(${(i * 360 / Math.max(n, 1))}, 100%, 50%)`
        );

        for (let i = 0; i < n; i++) {
            const ds = datasetsArr[i];
            const cv = curvesArr[i];
            const color = colors[i];

            const tVal        = temps[i];
            const labelSuffix = (tVal !== null && typeof tVal !== 'undefined') ? ` [${tVal}]` : '';


            if (ds?.data?.length) {
                traces.push({
                    x: ds.data.map(p => p.x),
                    y: ds.data.map(p => p.y),
                    mode: 'markers',
                    type: 'scatter',
                    name: `Data points ${i + 1}${labelSuffix}`,
                    marker: { color },
                    visible: (mode === 'plot') ? 'legendonly' : true
                });
            }

            if (Array.isArray(cv) && cv.length) {
                traces.push({
                    x: cv.map(p => p.x),
                    y: cv.map(p => p.y),
                    mode: 'lines',
                    type: 'scatter',
                    name: `Fit Curve ${i + 1}${labelSuffix}`,
                    line: { color, width: 2 }
                });
            }
        }

        const layout = {
            // title: 'Correlated Fit',
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true }
        };

        const plotId = `${activeTabId}-plot`;
        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');

        if (mode === "plot") {
            for (const t of traces) {
                if (t && t.mode === 'markers') t.visible = 'legendonly';
            }
        }


        Plotly.react(plotId, traces, layout);
    }

    function svante_plotNormalForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const curvesArr   = parseMultiFitCurves_corr(__corrLastFitJson["fit-curves"], "fit");
        $(`#${activeTabId}-plots-container`).css('visibility','visible');
        plotNewDataMulti_svante(datasetsArr, curvesArr, activeTabId, "fit");
    }

    function svante_plotContribForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        // --- figure out active profile index (0-based) ---
        const tabIdx = Math.max(0, (parseInt((activeTabId || '').replace('profile',''), 10) || 1) - 1);

        // --- DATA POINTS for this tab only ---
        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const ds = Array.isArray(datasetsArr) ? (datasetsArr[tabIdx] || datasetsArr[0]) : null;

        // --- IS/OS for this tab only ---
        const fitCurvesRaw = __corrLastFitJson["fit-curves"];

        // Normalize into per-profile blocks in the same way as your "fit" path,
        // then pick only the block for the active tab.
        const perProfileBlocks = normalizeFitCurvesBlocks_svante(fitCurvesRaw, "fit"); // returns an array of blocks
        const blockForTab = Array.isArray(perProfileBlocks) ? perProfileBlocks[tabIdx] : null;

        // Parse IS (2nd column) and OS (3rd column) just for that one block
        const { IS, OS } = blockForTab
            ? parseFitCurvesISOS([blockForTab])
            : { IS: [], OS: [] };

        // --- assemble traces (Data Points + IS + OS) ---
        const traces = [];

        if (ds && ds.data && ds.data.length) {
            traces.push({
                x: ds.data.map(p => p.x),
                y: ds.data.map(p => p.y),
                mode: 'markers',
                type: 'scatter',
                name: 'Data Points',
                visible: true,
            });
        }

        if (IS.length) {
            traces.push({
                x: IS.map(p => p.x),
                y: IS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'IS',
                line: { width: 2 }
            });
        }

        if (OS.length) {
            traces.push({
                x: OS.map(p => p.x),
                y: OS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'OS',
                line: { dash: 'dot', width: 2 }
            });
        }

        const layout = {
            // title: { text: `NMRD Contributions — ${activeTabId}` },
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true },
            showlegend: true
        };

        const plotId = `${activeTabId}-plot`;
        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
        Plotly.react(plotId, traces, layout);
    }





    function parseFitCurvesISOS(fitCurvesArray) {
        const IS = [];
        const OS = [];

        fitCurvesArray.forEach(dataString => {
            const lines = String(dataString).replace(/\\n/g, '\n').trim().split("\n");
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;

                const parts = trimmed.split(/\s+/).map(Number);
                if (parts.length < 4) return; // must have x + at least 3 values

                const x = parts[0];
                const y1 = parts[1]; // take the 2nd numeric value (index 2)
                const y2 = parts[2]; // take the 3rd numeric value (index 3)

                if (!isNaN(x) && !isNaN(y1)) IS.push({ x, y: y1 });
                if (!isNaN(x) && !isNaN(y2)) OS.push({ x, y: y2 });
            });
        });

        return { IS, OS };
    }

    $('#submit-button').on('click', saveParametersForAllTabs_svante);
    // $('#submit-button').on('click', saveForPlot_svante);
    // $('#submit-button').on('click',function () {
    //     $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
    // });


    $(document).ready(function () {
        function getCheckedFitMethods() {
            const map = {
                "simp-check":  "simp",
                "scan-check":  "scan",
                "min-check":   "migrad",
                "minos-check": "minos"
            };
            return Object.keys(map)
                .filter(id => $("#" + id).is(":checked"))
                .map(id => map[id]);
        }        $('#fit-button').off('click').on('click', function () {
            console.log('[FIT] Saving UI to *_arrhenius.json, then running /fit_svante ...');

            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', true);
            $('#fit-spinner-overlay').removeClass('d-none').addClass('d-flex');

            const $activeTab = $('#myTabContent .tab-pane.active');
            const activeTabId = $activeTab.attr('id');

            const toExp5 = (v) => {
                if (v === '' || v == null) return '';
                const n = Number(v);
                if (!isFinite(n)) return String(v);
                return n.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1');
            };

            // --- physical constants (safe if globals aren't defined yet) ---
            const TWO_PI_C = (typeof TWO_PI_c !== 'undefined' ? TWO_PI_c : 2 * Math.PI * 2.99792458e10); // s^-1 per cm^-1

            function convForUi(paramName, raw, $row) {
                if (raw === '' || raw == null) return '';
                const x = Number(raw);
                if (!Number.isFinite(x)) return '';

                // SLS: backend stores sqrt(S²); UI in S² should show S²
                if (paramName === "SLS") {
                    const unitSel = String(
                        $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || 's2'
                    );
                    if (unitSel === "s2") {
                        return x * x;
                    }
                    // UI in "sls" → show raw backend value
                    return x;
                }

                const unit = String(
                    $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || ''
                );

                if (paramName === 'Delta2') {
                    // backend stores Δ² in s⁻²; UI cm⁻¹ shows √(Δ²)/(2πc)
                    const base = x < 0 ? 0 : x;
                    return unit === 'cm-1'
                        ? (Math.sqrt(base) / TWO_PI_c)
                        : x;
                }

                if (paramName === 'r' || paramName === 'a') {
                    // backend stores meters; UI Å shows m → Å
                    return (unit === 'A' || unit === 'Å')
                        ? x * angstrom
                        : x;
                }

                if (paramName === "Aoh") return x / Aoh_conv;

                return x;
            }

            // name mapping from fit JSON → UI data-param names
            const nameMap = {
                tmref: 'tm',
                tvref: 'tv',
                trref: 'tR',
                tlref: 'tl'
            };


            saveParametersForAllTabs_svante()
                .then(() => {
                    console.log('[FIT] Starting fit...');
                    return $.ajax({ url: '/fit_svante', method: 'POST',
                        data: { methods: getCheckedFitMethods() }, traditional: true });
                })
                .then((response) => {
                    console.log('[FIT] /fit_svante finished successfully.');

                    let fitJson;
                    try {
                        fitJson = (typeof response === 'string') ? JSON.parse(response) : response;
                    } catch (err) {
                        console.error('[FIT] Could not parse JSON:', err, response);
                        alert('Fit failed: invalid JSON from server.');
                        return;
                    }

                    const parTables = Array.isArray(fitJson['par-tables']) ? fitJson['par-tables'] : null;
                    if (!parTables) {
                        console.warn('[FIT] No par-tables found in response JSON.');
                    } else {
                        console.log('[FIT] Applying fitted parameters to all tabs (with conversions)…');
                        const $tabs = $('#myTabContent .tab-pane');

                        $tabs.each(function (tabIdx) {
                            const $tab = $(this);
                            if (!parTables[tabIdx]) return;

                            const pid   = $tab.attr('id');
                            const fermi = $(`#fermiContactTermCheckbox-${pid}`).is(':checked');
                            const mf    = $(`#modelFreeCheckbox-${pid}`).is(':checked');
                            const os    = $(`#outerSphereCheckbox-${pid}`).is(':checked');

                            parTables[tabIdx].forEach((entry) => {
                                let uiName = String(entry.name || '').replace(/_$/, ''); // handles Delta2_ → Delta2
                                if (!uiName) return;

                                // map special ref names to UI param ids
                                if (Object.prototype.hasOwnProperty.call(nameMap, uiName)) {
                                    uiName = nameMap[uiName];
                                }

                                // respect feature toggles
                                if (!fermi && uiName === 'Aoh') return;
                                if (!mf    && (uiName === 'SLS' || uiName === 'tl')) return;
                                if (!os    && (uiName === 'D'   || uiName === 'a'  || uiName === 'fn')) return;

                                const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
                                if ($row.length === 0) return;

                                const v    = convForUi(uiName, entry.value, $row);
                                const vmin = convForUi(uiName, entry.min,   $row);
                                const vmax = convForUi(uiName, entry.max,   $row);

                                // // --- new: parameter error (convert + format) ---
                                // const errConv = convForUi(uiName, entry.err, $row);
                                // const errNum = parseFloat(errConv);
                                // const $err = $row.find('input.param-error');
                                // if ($err.length) {
                                //     if (Number.isFinite(errNum)) {
                                //         $err.val(errNum.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1'));
                                //     } else {
                                //         $err.val('');
                                //     }
                                // }


                                const $value = $row.find('input[type="text"]').filter(function () {
                                    const ph = $(this).attr('placeholder');
                                    return ph !== 'min' && ph !== 'max';
                                }).first();
                                if ($value.length) $value.val(v === '' ? '' : (Number.isFinite(v) ? v.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1') : v));

                                const $min = $row.find('input[placeholder="min"]');
                                const $max = $row.find('input[placeholder="max"]');
                                if ($min.length) $min.val(vmin === '' ? '' : (Number.isFinite(vmin) ? vmin.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1') : vmin));
                                if ($max.length) $max.val(vmax === '' ? '' : (Number.isFinite(vmax) ? vmax.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1') : vmax));
                            });
                        });
                    }

                    // keep existing plotting
                    $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
                    __corrLastFitJson = fitJson;
                    const datasetsArr = parseDadosforPlot_corr(fitJson["Dados"]);
                    const curvesArr   = parseMultiFitCurves_corr(fitJson["fit-curves"], "fit");
                    renderSamePlotEverywhere(datasetsArr, curvesArr);

                    $('#myTabContent .tab-pane').each(function (tabIdx) {
                        const pid = this.id;
                        updateArrheniusFitQuality(pid, fitJson, tabIdx);
                        setAxisScaleUIVisible(pid, true);
                    });
                    ErrorSvante(fitJson);
                    renderSvanteTable();
                    //
                    // updateArrheniusFitQuality(profileId, response);
                    // setAxisScaleUIVisible(profileId, true);


                })
                .catch((err) => {
                    if (err && (err.statusText === 'abort' || err === 'abort')) {
                        console.log('Fit aborted by user');
                        return;
                    }
                    const msg = (err && (err.responseText || err.statusText)) ? String(err.responseText || err.statusText) : 'Unknown error';
                    console.error('Fit error:', err);
                    console.log('Fit failed:', msg);
                })
                .always(() => {
                    $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);
                    $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
                });
        });


        $('#cancel-fit-button').off('click').on('click', function () {
            __cancelAjax.abortAll();

            // Ask the backend to kill any running fit process
            $.ajax({ url: '/fit_cancel', method: 'POST' });

            // Restore the UI immediately
            $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);

            console.log('All AJAX aborted and backend processes canceled.');
        });








        $('#close-plot').on('click', function () {
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id'); // Get active tab
            Plotly.purge(`${activeTabId}-plot`);
            $(`#${activeTabId}-plots-container`).css('visibility', 'hidden');
            console.log(`Plot for ${activeTabId} has been cleared and hidden.`);
        });

        (function () {
            const __corrCompareModeByTab = {};

            $('#switch-plot').off('click').on('click', function () {
                const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
                __corrCompareModeByTab[activeTabId] = !__corrCompareModeByTab[activeTabId];

                if (__corrCompareModeByTab[activeTabId]) {
                    // C mode → swap to y1/y2 from fit-curves
                    svante_plotContribForActiveTab();
                } else {
                    // back to normal fit plot
                    svante_plotNormalForActiveTab();
                }
            });
        })();




        $('#plot-button').off('click').on('click', function () {

            const shared = ($('#shared-textarea').val() || "");

            if (!shared.trim() || shared.includes("<Add input here>")) {
                if (typeof missingInputToast === 'function') {
                    missingInputToast("Please provide an input", "warning");
                } else {
                    alert("Please provide an input");
                }
                return;
            }

            const setSpin = on => $('#fit-spinner-overlay')
                .toggleClass('d-none', !on)
                .toggleClass('d-flex', on);

            const setDis = d => $('#fit-button, #plot-button, #switch-plot, #close-plot')
                .prop('disabled', d);

            setDis(true);
            setSpin(true);

            saveForPlot_svante()
                .then(() => {
                    console.log("[PLOT] Calling /fit_svante …");
                    return $.ajax({ url: '/fit_svante', method: 'POST',
                        data: { methods: getCheckedFitMethods() }, traditional: true });
                })
                .then(response => {

                    // fit_svante directly returns the final arrhenius JSON.
                    const fitJson = (typeof response === "string") ? JSON.parse(response) : response;

                    if (!fitJson) {
                        throw new Error("Empty JSON returned from /fit_svante");
                    }

                    // store for contribution plots etc.
                    __corrLastFitJson = fitJson;

                    // Parse for plotting
                    const datasetsArr = parseDadosforPlot_corr(fitJson["Dados"]);
                    const curvesArr   = parseMultiFitCurves_corr(fitJson["fit-curves"], "fit");

                    // plot onto every tab
                    renderSamePlotEverywhere(datasetsArr, curvesArr, "plot");

                    // rebuild Arrhenius table
                    renderSvanteTable();
                    $('#myTabContent .tab-pane').each(function () {
                        const pid = this.id;
                        setAxisScaleUIVisible(pid, true);
                    });

                })
                .catch(err => {
                    console.error('[PLOT] Error:', err);
                    alert('Plot failed: ' +
                        (err?.responseText || err?.statusText || err?.message || 'Unknown error'));
                })
                .finally(() => {
                    setSpin(false);
                    setDis(false);
                });
        });



        $('#switch-plot').hide().prop('disabled', true);

        // Show or hide the C button based on the active tab's Outer Sphere checkbox
        $(document).on('shown.bs.tab change', 'a[data-toggle="tab"], [id^="outerSphereCheckbox-"]', function () {
            const activeTab = $('#myTabContent .tab-pane.active').attr('id');
            const isOSChecked = $(`#outerSphereCheckbox-${activeTab}`).is(':checked');

            $('#switch-plot').toggle(isOSChecked).prop('disabled', !isOSChecked);
        });

    });

});

$('[data-toggle="tooltip"]').tooltip(); // Initialize tooltips for the first time

function enableTabRename(profileId, tabNameElement) {
    const currentName = tabNameElement.text();
    const inputField = $(`<input type="text" class="form-control rename-input" value="${currentName}" style="width: auto; display: inline-block;">`);
    tabNameElement.replaceWith(inputField);

    inputField.focus();

    inputField.on('blur', function () {
        const newName = $(this).val();
        inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
        updateTabSelectOptions();
    });

    inputField.on('keypress', function (e) {
        if (e.which == 13) {
            const newName = $(this).val();
            inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
            updateTabSelectOptions();
        }
    });
}

$(document).on('click', '.editable-profile-name', function () {
    const profileId = $(this).data('profile');
    const tabNameElement = $(`#${profileId}-name`);
    enableTabRename(profileId, tabNameElement);
});

(function () {

    function pad2(n) { return String(n).padStart(2, '0'); }

    function makeTimestamp() {
        const d = new Date();
        return (
            pad2(d.getHours()) +
            pad2(d.getMinutes()) +
            pad2(d.getDate()) +
            pad2(d.getMonth() + 1) +
            pad2(d.getFullYear() % 100)
        ); // HHmmDDMMyy
    }

    function sanitize(name) {
        return String(name).trim().replace(/\s+/g, '').replace(/[^\w-]/g, '');
    }

    function csvCell(x) {
        const s = (x === null || x === undefined) ? '' : String(x);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    function rowToCsv(cells) {
        return cells.map(csvCell).join(',');
    }

    function downloadBlob(blob, filename) {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showExportError(msg) {
        alert(msg);
    }

    function getActiveProfileId() {
        return $('#myTabContent .tab-pane.active').attr('id') || 'profile1';
    }

    function getProfileIndex(profileId) {
        const m = String(profileId).match(/profile(\d+)/i);
        return m ? parseInt(m[1], 10) : 1;
    }

    function getActiveProfileName(profileId) {
        const label = $(`#${profileId}-name`).text();
        return sanitize(label || profileId);
    }

    function getFixFree($row) {
        return $row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix';
    }

    function getGraphDiv(profileId) {
        return document.getElementById(`${profileId}-plot`) || null;
    }

    function getFitQuality(profileId) {
        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return { chi2: '', R2: '' };

        const tds = $box.find('td');
        if (tds.length >= 4) {
            return {
                chi2: $(tds[1]).text().trim(),
                R2:   $(tds[3]).text().trim()
            };
        }
        return { chi2: '', R2: '' };
    }

    function hasAnyPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data || !Array.isArray(gd.data)) return false;

        const idx = getProfileIndex(profileId);

        const reData = new RegExp(`^Data\\s*points\\s*${idx}(\\b|\\s|\\[)`, 'i');
        const reFit  = new RegExp(`^Fit\\s*Curve\\s*${idx}(\\b|\\s|\\[)`, 'i');

        const hasNumbered =
            gd.data.some(t => reData.test(String(t?.name || ''))) ||
            gd.data.some(t => reFit.test(String(t?.name || '')));

        const hasContrib =
            gd.data.some(t => /^Data\s*Points$/i.test(String(t?.name || ''))) ||
            gd.data.some(t => /^IS$/i.test(String(t?.name || ''))) ||
            gd.data.some(t => /^OS$/i.test(String(t?.name || '')));

        return hasNumbered || hasContrib;
    }

    function getDataFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y: [], yerr: [] };

        const idx = getProfileIndex(profileId);

        const reNumbered = new RegExp(`^Data\\s*points\\s*${idx}(\\b|\\s|\\[)`, 'i');
        let tData = gd.data.find(t => t && reNumbered.test(String(t.name || '')));

        if (!tData) tData = gd.data.find(t => t && /^Data\s*Points$/i.test(String(t.name || '')));

        if (!tData || !Array.isArray(tData.x) || !Array.isArray(tData.y)) {
            return { x: [], y: [], yerr: [] };
        }

        const errArr =
            (tData.error_y && Array.isArray(tData.error_y.array))
                ? tData.error_y.array
                : [];

        return { x: tData.x.slice(), y: tData.y.slice(), yerr: errArr.slice() };
    }

    function getFitFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y1: [], y2: [], hasTwo: false };

        const idx = getProfileIndex(profileId);

        const tIS = gd.data.find(t => t && /^IS$/i.test(String(t.name || '')));
        const tOS = gd.data.find(t => t && /^OS$/i.test(String(t.name || '')));

        if (tIS && tOS && Array.isArray(tIS.x) && Array.isArray(tIS.y) && Array.isArray(tOS.y)) {
            return { x: tIS.x.slice(), y1: tIS.y.slice(), y2: tOS.y.slice(), hasTwo: true };
        }

        const reFit = new RegExp(`^Fit\\s*Curve\\s*${idx}(\\b|\\s|\\[)`, 'i');
        const tFit = gd.data.find(t => t && reFit.test(String(t.name || '')));

        if (!tFit || !Array.isArray(tFit.x) || !Array.isArray(tFit.y)) {
            return { x: [], y1: [], y2: [], hasTwo: false };
        }

        return { x: tFit.x.slice(), y1: tFit.y.slice(), y2: [], hasTwo: false };
    }

    function exportParametersCsv_arrhenius() {

        // --- 0. Reference values from profile 1, same as the svante table uses ---
        const $p1 = $('#profile1');
        const readV_p1 = (p) => parseFloat($p1.find(`.parameter-input[data-param="${p}"] .param-value`).val());
        const TrefRaw  = ($('#profile1-tab .additional-input').val() || '').trim()
            || ($('#profile1-tab .additional-input').attr('placeholder') || '');
        const Tref     = parseFloat(TrefRaw);

        const tmref = readV_p1('tm');
        const trref = readV_p1('tR');
        const tvref = readV_p1('tv');
        const Em    = readV_p1('Em');
        const ER    = readV_p1('ER');
        const Ev    = readV_p1('Ev');
        const modelFreeActive = $p1.find('#modelFreeCheckbox-profile1').is(':checked');
        const tlref = modelFreeActive ? readV_p1('tl') : null;
        const El    = modelFreeActive ? readV_p1('El') : null;

        // Same "invalid pair" rule as renderSvanteTable: Fix+0 means no Arrhenius scaling.
        const isInvalidArrh = (Ename) => {
            const $row = $p1.find(`.parameter-input[data-param="${Ename}"]`);
            if (!$row.length) return false;
            const isFree = $row.find('.fix-free-switch').is(':checked');
            const v      = parseFloat($row.find('.param-value').val());
            return (!isFree && Number.isFinite(v) && v === 0);
        };
        const invalid_tm = isInvalidArrh('Em');
        const invalid_tR = isInvalidArrh('ER');
        const invalid_tv = isInvalidArrh('Ev');
        const invalid_tl = modelFreeActive ? isInvalidArrh('El') : false;

        const arrh = (tauRef, E, T) => tauRef * Math.exp(E * (1.0 / T - 1.0 / Tref));

        // --- 1. Collect all tabs and their temperatures ---
        const allTabs = [];
        $('#myTabContent .tab-pane').each(function () {
            const pid = $(this).attr('id');
            if (!pid) return;
            const tabIdx = allTabs.length;
            const tempRaw = ($(`#${pid}-tab .additional-input`).val() || '').trim()
                || ($(`#${pid}-tab .additional-input`).attr('placeholder') || '');
            const T = parseFloat(tempRaw);
            allTabs.push({ pid, tabIdx, T: Number.isFinite(T) ? T : '' });
        });

        if (!allTabs.length) { showExportError('Export error: no tabs found.'); return; }

        const anyPlot = allTabs.some(({ pid }) => hasAnyPlot(pid));
        if (!anyPlot) {
            showExportError('Export error: no plot found in any tab. Please run a fit or plot first.');
            return;
        }
        // --- 2. Gather per-tab data ---
        const tabData = allTabs.map(({ pid, tabIdx, T }) => {
            const paramRows = [];
            $(`#${pid} .parameter-input`).each(function () {
                const $row = $(this);
                const param = String($row.data('param') || '').trim();
                if (!param) return;
                let value      = $row.find('.param-value').val();
                const errorRaw = $row.find('.param-error').val();
                const error    = (pid !== 'profile1' && (param === 'tm' || param === 'tR' || param === 'tv' || param === 'tl')) ? '' : ((!errorRaw || String(errorRaw).trim() === '') ? 'na' : errorRaw);
                // Arrhenius-scale τ for tabs other than profile 1.
                // Profile 1 holds the reference at Tref, so its τ values are already correct.
                if (pid !== 'profile1' && Number.isFinite(Tref) && Number.isFinite(T)) {
                    if (param === 'tm' && !invalid_tm && Number.isFinite(tmref) && Number.isFinite(Em)) {
                        value = arrh(tmref, Em, T);
                    } else if (param === 'tR' && !invalid_tR && Number.isFinite(trref) && Number.isFinite(ER)) {
                        value = arrh(trref, ER, T);
                    } else if (param === 'tv' && !invalid_tv && Number.isFinite(tvref) && Number.isFinite(Ev)) {
                        value = arrh(tvref, Ev, T);
                    } else if (param === 'tl' && modelFreeActive && !invalid_tl
                        && Number.isFinite(tlref) && Number.isFinite(El)) {
                        value = arrh(tlref, El, T);
                    }
                }

                paramRows.push({ param, fixfree: getFixFree($row), value, error });
            });
            // Append T row after parameters
            paramRows.push({ param: 'T', fixfree: '', value: T !== '' ? String(T) : '', error: '' });

            const { chi2, R2 } = getFitQuality(pid);
            const fit = getFitFromPlot(pid);
            const dat = getDataFromPlot(pid);

            return { T, paramRows, chi2, R2, fit, dat };
        });

        // --- 3. Build header row ---
        // A-F: Parameter, Fix/Free, Value, Error, chi2, R2
        // G-H: fillers
        // Then for each tab: fit_x_T, fit_y_T, (empty), data_x_T, data_y_T, (empty)
        const header = ['Parameter', 'Fix/Free', 'Value', 'Error', 'chi2', 'R2', '', ''];
        tabData.forEach(({ T }) => {
            const label = T !== '' ? `_${T}` : '';
            header.push(`fit_x${label}`, `fit_y${label}`, '', `data_x${label}`, `data_y${label}`, '');
        });

        // --- 4. Build rows ---
        // Parameters from all tabs are stacked vertically in A-F.
        // For tab N, its fit/data columns start at offset 8 + N*6.
        // We need a row for every vertical slot: each tab contributes paramRows.length rows,
        // and we also need enough rows to cover the longest fit/data series.

        // Compute vertical extents per tab
        const tabParamCount = tabData.map(td => td.paramRows.length); // includes T row
        const tabSeriesLen  = tabData.map(td => Math.max(td.fit.x.length, td.dat.x.length));

        // Total rows needed
        let totalRows = 0;
        tabData.forEach((td, i) => {
            totalRows = Math.max(totalRows, /* param block start */ tabParamOffset(i, tabParamCount) + tabParamCount[i]);
            totalRows = Math.max(totalRows, tabSeriesLen[i]);
        });

        function tabParamOffset(tabIdx, counts) {
            // Each tab's param block is stacked: tab0 starts at row 0, tab1 at row counts[0], etc.
            let offset = 0;
            for (let t = 0; t < tabIdx; t++) offset += counts[t];
            return offset;
        }

        // Pre-fill all rows with empty A-F + per-tab empty cells
        const numCols = 8 + tabData.length * 6;  // A-H + 6 cols per tab
        const rows = Array.from({ length: totalRows }, () => Array(numCols).fill(''));

        // Fill A-F param blocks (stacked vertically per tab)
        tabData.forEach((td, tabIdx) => {
            const rowStart = tabParamOffset(tabIdx, tabParamCount);
            td.paramRows.forEach(({ param, fixfree, value, error }, rowOff) => {
                const r = rowStart + rowOff;
                rows[r][0] = param;
                rows[r][1] = fixfree;
                rows[r][2] = value;
                rows[r][3] = error;
            });
            // chi2 and R2 in first param row of this tab
            rows[rowStart][4] = td.chi2 || '';
            rows[rowStart][5] = td.R2   || '';
        });

        // Fill fit_x/fit_y and data_x/data_y horizontally per tab
        tabData.forEach((td, tabIdx) => {
            const colBase = 8 + tabIdx * 6;  // fit_x starts here
            const { fit, dat } = td;
            const seriesLen = Math.max(fit.x.length, dat.x.length);
            for (let r = 0; r < seriesLen; r++) {
                rows[r][colBase + 0] = fit.x[r]  ?? '';
                rows[r][colBase + 1] = fit.y1[r] ?? '';
                // colBase+2 stays empty (separator)
                rows[r][colBase + 3] = dat.x[r]  ?? '';
                rows[r][colBase + 4] = dat.y[r]  ?? '';
                // colBase+5 stays empty (separator)
            }
        });

        // --- 5. Serialise ---
        const ts = makeTimestamp();
        const filename = `${ts}_arrhenius.csv`;

        const csvLines = [rowToCsv(header), ...rows.map(r => rowToCsv(r))];
        const csvText  = csvLines.join('\n') + '\n';
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, filename);
    }

    $(document)
        .off('click.exportCsvArrhenius', '#export-button')
        .on('click.exportCsvArrhenius', '#export-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            exportParametersCsv_arrhenius();
        });

})();

$('#container-width').on('input', function () {
    let newWidth = $(this).val() + 'px';
    $('.container').css('width' +
        '' +
        '' +
        '', newWidth);
});

// Toasts for notifications
$('#maxTabsToast').toast({ delay: 2000 });
$('#lastTabToast').toast({ delay: 2000 });



