document.addEventListener('DOMContentLoaded', () => {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const STORAGE_BUCKET = 'pda-arquivos';

  const form = document.getElementById('dataset-form');
  const progressBar = document.getElementById('progress-bar');

  // Views
  const loginView = document.getElementById('login-view');
  const forcePasswordView = document.getElementById('force-password-view');
  const userView = document.getElementById('user-view');
  const adminView = document.getElementById('admin-view');
  const headerActions = document.getElementById('header-actions-authenticated');

  // Steps & Indicators
  const steps = [
    document.getElementById('section-step-1'),
    document.getElementById('section-step-2'),
    document.getElementById('section-step-3')
  ];
  const indicators = [
    document.getElementById('indicator-step-1'),
    document.getElementById('indicator-step-2'),
    document.getElementById('indicator-step-3')
  ];

  let currentStep = 1;
  let currentUser = null;
  let currentProfile = null;
  let cachedSubmissions = [];

  // Buttons
  const btnStep1Next = document.getElementById('btn-step1-next');
  const btnStep2Prev = document.getElementById('btn-step2-prev');
  const btnStep2Next = document.getElementById('btn-step2-next');
  const btnStep3Prev = document.getElementById('btn-step3-prev');
  const btnFillDemo = document.getElementById('btn-fill-demo');
  const btnClearDraft = document.getElementById('btn-clear-draft');
  const btnPrint = document.getElementById('btn-print');
  const btnToggleAdmin = document.getElementById('btn-toggle-admin');
  const btnSubmit = document.getElementById('btn-submit');

  // Conditional elements
  const q8Radios = document.getElementsByName('q8_relacao_ods');
  const cardQ9 = document.getElementById('card-q9-ods');

  // Modals & Toasts
  const successModal = document.getElementById('success-modal');
  const btnModalClose = document.getElementById('btn-modal-close');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  // --- LOGIN FORM ELEMENTS ---
  const loginForm = document.getElementById('login-form');
  const loginEmailInput = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginErrorText = document.getElementById('login-error-text');
  const btnLoginSubmit = document.getElementById('btn-login-submit');
  const btnToggleLoginPassword = document.getElementById('btn-toggle-login-password');
  const iconLoginEye = document.getElementById('icon-login-eye');
  const userBadgeText = document.getElementById('user-badge-text');
  const btnLogout = document.getElementById('btn-logout');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  // --- FORCE PASSWORD CHANGE FORM ELEMENTS ---
  const forcePasswordForm = document.getElementById('force-password-form');
  const forcePasswordNewInput = document.getElementById('force-password-new');
  const forcePasswordConfirmInput = document.getElementById('force-password-confirm');
  const forcePasswordError = document.getElementById('force-password-error');
  const forcePasswordErrorText = document.getElementById('force-password-error-text');
  const btnForcePasswordSubmit = document.getElementById('btn-force-password-submit');

  // Draft key is namespaced per-user so a shared computer doesn't mix drafts
  function draftKey() {
    return currentUser ? `dados_gov_br_draft_${currentUser.id}` : null;
  }

  // File Upload Elements Setup
  const setupFileUpload = (zoneId, inputId, previewId) => {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!zone || !input || !preview) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
      }, false);
    });

    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        input.files = files;
        updatePreview();
      }
    });

    input.addEventListener('change', updatePreview);

    function updatePreview() {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        if (sizeMb > 10) {
          showToast(`O arquivo excede o limite de 10MB (${sizeMb}MB)`, 'error');
          input.value = '';
          preview.innerHTML = '';
          return;
        }
        preview.innerHTML = `<i class="fa-solid fa-file"></i> Arquivo selecionado: ${file.name} (${sizeMb} MB)`;
      } else {
        preview.innerHTML = '';
      }
    }
  };

  setupFileUpload('upload-zone-q22', 'q22_arquivo_recurso', 'preview-q22');
  setupFileUpload('upload-zone-q25', 'q25_arquivo_dicionario', 'preview-q25');

  // Show / Hide Step Function
  function goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 3) return;

    currentStep = stepNumber;

    steps.forEach((sec, idx) => {
      if (idx + 1 === currentStep) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    indicators.forEach((ind, idx) => {
      const stepIdx = idx + 1;
      ind.classList.remove('active', 'completed');
      if (stepIdx === currentStep) {
        ind.classList.add('active');
      } else if (stepIdx < currentStep) {
        ind.classList.add('completed');
      }
    });

    const progressPercent = ((currentStep - 1) / 2) * 80;
    progressBar.style.width = `${progressPercent}%`;

    if (currentStep === 3) {
      renderSummary();
    }

    window.scrollTo({ top: 150, behavior: 'smooth' });
  }

  // Toggle ODS Q9 depending on Q8
  function updateOdsVisibility() {
    let q8Val = '';
    q8Radios.forEach(r => {
      if (r.checked) q8Val = r.value;
    });

    if (q8Val === 'SIM') {
      cardQ9.style.display = 'block';
    } else {
      cardQ9.style.display = 'none';
    }
  }

  q8Radios.forEach(radio => {
    radio.addEventListener('change', updateOdsVisibility);
  });

  // Highlight option item radio/checkbox containers
  function setupOptionItemHighlighting() {
    const optionLabels = document.querySelectorAll('.option-item');
    optionLabels.forEach(label => {
      const input = label.querySelector('input');
      if (!input) return;

      const updateClass = () => {
        if (input.type === 'radio') {
          document.querySelectorAll(`input[name="${input.name}"]`).forEach(r => {
            r.closest('.option-item')?.classList.remove('selected');
          });
          if (input.checked) label.classList.add('selected');
        } else if (input.type === 'checkbox') {
          if (input.checked) label.classList.add('selected');
          else label.classList.remove('selected');
        }
      };

      input.addEventListener('change', updateClass);
      if (input.checked) label.classList.add('selected');
      else label.classList.remove('selected');
    });
  }
  setupOptionItemHighlighting();

  // Validate Step 1
  function validateStep1() {
    const q1Checked = document.querySelector('input[name="q1_dados_abertos"]:checked');
    if (!q1Checked) {
      showToast('Por favor, responda a pergunta 1 (Dados abertos)', 'error');
      return false;
    }

    const q2Val = document.getElementById('q2_titulo_base').value.trim();
    if (!q2Val) {
      showToast('Por favor, informe o Título da base de dados (Pergunta 2)', 'error');
      document.getElementById('q2_titulo_base').focus();
      return false;
    }

    let q8Val = '';
    q8Radios.forEach(r => { if (r.checked) q8Val = r.value; });
    if (q8Val === 'SIM') {
      const q9Checked = document.querySelectorAll('input[name="q9_ods"]:checked');
      if (q9Checked.length === 0) {
        showToast('Por favor, escolha pelo menos um ODS na pergunta 9', 'error');
        return false;
      }
    }

    return true;
  }

  // Navigation Event Listeners
  btnStep1Next.addEventListener('click', () => {
    if (validateStep1()) {
      saveDraft();
      goToStep(2);
    }
  });

  btnStep2Prev.addEventListener('click', () => {
    saveDraft();
    goToStep(1);
  });

  btnStep2Next.addEventListener('click', () => {
    saveDraft();
    goToStep(3);
  });

  btnStep3Prev.addEventListener('click', () => {
    goToStep(2);
  });

  indicators.forEach(ind => {
    ind.addEventListener('click', () => {
      const targetStep = parseInt(ind.getAttribute('data-step'), 10);
      if (targetStep === 2 && !validateStep1()) return;
      if (targetStep === 3 && !validateStep1()) return;
      goToStep(targetStep);
    });
  });

  // Collect All Form Data
  function getFormData() {
    const formData = new FormData(form);
    const data = {};

    for (let [key, value] of formData.entries()) {
      if (key === 'q9_ods') {
        if (!data[key]) data[key] = [];
        data[key].push(value);
      } else if (value instanceof File) {
        data[key] = value.name || 'Nenhum arquivo enviado';
      } else {
        data[key] = value;
      }
    }
    return data;
  }

  // Escapa texto vindo de usuários antes de injetar em innerHTML (previne XSS armazenado)
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Helper Function: Generate Structured Report HTML
  function generateReportHTML(data, subId = '', subTimestamp = '') {
    const getVal = (key, defaultText = 'Não informado') => {
      const val = data[key];
      const raw = Array.isArray(val) ? (val.length ? val.join(', ') : defaultText) : (val && val.toString().trim() ? val : defaultText);
      return escapeHtml(raw);
    };

    const emitDate = subTimestamp || new Date().toLocaleDateString('pt-BR');
    const headerId = subId ? `<span style="font-size: 0.85rem; color: #1351b4; font-weight: bold;">#ID: ${subId}</span>` : '';

    return `
      <div class="print-header">
        <div class="print-header-top">
          <div>
            <div class="gov-title">PORTAL DADOS.GOV.BR • GOVERNO FEDERAL</div>
            <div class="doc-title">Ficha de Cadastro de Conjunto de Dados</div>
          </div>
          <div>${headerId}</div>
        </div>
        <div class="print-meta">
          <span><strong>Órgão/Organização:</strong> Ministério do Esporte (MESP)</span>
          <span><strong>Data de Emissão:</strong> ${emitDate}</span>
        </div>
      </div>

      <div class="summary-section-title">1. Identificação do Conjunto de Dados</div>
      <table class="report-table">
        <tbody>
          <tr>
            <td class="col-label">1. Dados abertos</td>
            <td class="col-value">${getVal('q1_dados_abertos')}</td>
          </tr>
          <tr>
            <td class="col-label">2. Título da base de dados</td>
            <td class="col-value" style="font-weight: 600;">${getVal('q2_titulo_base')}</td>
          </tr>
          <tr>
            <td class="col-label">3. Descrição</td>
            <td class="col-value">${getVal('q3_descricao')}</td>
          </tr>
          <tr>
            <td class="col-label">4. Área técnica responsável</td>
            <td class="col-value">${getVal('q4_area_tecnica')}</td>
          </tr>
          <tr>
            <td class="col-label">5. E-mail da área técnica</td>
            <td class="col-value">${getVal('q5_email_area')}</td>
          </tr>
          <tr>
            <td class="col-label">6. Periodicidade de atualização</td>
            <td class="col-value">${getVal('q6_periodicidade')}</td>
          </tr>
          <tr>
            <td class="col-label">7. Tema principal</td>
            <td class="col-value">${getVal('q7_temas')}</td>
          </tr>
          <tr>
            <td class="col-label">8. Possui relação com ODS?</td>
            <td class="col-value">${getVal('q8_relacao_ods')}</td>
          </tr>
          ${data['q8_relacao_ods'] === 'SIM' ? `
          <tr>
            <td class="col-label">9. Objetivos ODS selecionados</td>
            <td class="col-value">${getVal('q9_ods')}</td>
          </tr>` : ''}
          <tr>
            <td class="col-label">10. Dados de raça/etnia</td>
            <td class="col-value">${getVal('q10_raca')}</td>
          </tr>
          <tr>
            <td class="col-label">11. Dados de gênero</td>
            <td class="col-value">${getVal('q11_genero')}</td>
          </tr>
          <tr>
            <td class="col-label">12. Palavras-chave</td>
            <td class="col-value">${getVal('q12_palavras_chave')}</td>
          </tr>
          <tr>
            <td class="col-label">13 e 14. Cobertura temporal</td>
            <td class="col-value">De ${getVal('q13_cobertura_inicio', 'N/A')} até ${getVal('q14_cobertura_fim', 'N/A')}</td>
          </tr>
          <tr>
            <td class="col-label">15. Cobertura espacial</td>
            <td class="col-value">${getVal('q15_cobertura_espacial')}</td>
          </tr>
          <tr>
            <td class="col-label">16. Granularidade espacial</td>
            <td class="col-value">${getVal('q16_granularidade_espacial')}</td>
          </tr>
          <tr>
            <td class="col-label">17. Versão (numérica)</td>
            <td class="col-value">${getVal('q17_versao')}</td>
          </tr>
          <tr>
            <td class="col-label">18. Atualização da versão?</td>
            <td class="col-value">${getVal('q18_atualizacao_versao')}</td>
          </tr>
          <tr>
            <td class="col-label">19. Descontinuado?</td>
            <td class="col-value">${getVal('q19_descontinuado')}</td>
          </tr>
        </tbody>
      </table>

      <div class="summary-section-title" style="margin-top: 1.2rem;">2. Recursos e Dicionário de Dados</div>
      <table class="report-table">
        <tbody>
          <tr>
            <td class="col-label">20. Título do Recurso</td>
            <td class="col-value">${getVal('q20_titulo_recurso')}</td>
          </tr>
          <tr>
            <td class="col-label">21. Descrição do Recurso</td>
            <td class="col-value">${getVal('q21_descricao_recurso')}</td>
          </tr>
          <tr>
            <td class="col-label">22. Arquivo do Recurso</td>
            <td class="col-value">${getVal('q22_arquivo_recurso')}</td>
          </tr>
          <tr>
            <td class="col-label">23. Título do Dicionário</td>
            <td class="col-value">${getVal('q23_titulo_dicionario')}</td>
          </tr>
          <tr>
            <td class="col-label">24. Descrição do Dicionário</td>
            <td class="col-value">${getVal('q24_descricao_dicionario')}</td>
          </tr>
          <tr>
            <td class="col-label">25. Arquivo do Dicionário</td>
            <td class="col-value">${getVal('q25_arquivo_dicionario')}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // Render Step 3 Summary
  function renderSummary() {
    const summaryContainer = document.getElementById('summary-content');
    const data = getFormData();
    summaryContainer.innerHTML = generateReportHTML(data);
  }

  // Pre-fill Demo Data
  btnFillDemo?.addEventListener('click', () => {
    document.querySelector('input[name="q1_dados_abertos"][value="Aberto"]').checked = true;
    document.getElementById('q2_titulo_base').value = 'Folha de Pagamento aos Atletas do Bolsa Atleta';
    document.getElementById('q3_descricao').value = 'Dados da Folha de Pagamento aos atletas/beneficiários do Programa Bolsa Atleta, em todas as categorias de Bolsa no âmbito nacional.';
    document.getElementById('q4_area_tecnica').value = 'Secretaria Nacional de Esporte de Alto Rendimento (SNEAR)';
    document.getElementById('q5_email_area').value = 'snear.bolsa@esporte.gov.br';
    document.getElementById('q6_periodicidade').value = 'Mensal';
    document.getElementById('q7_temas').value = 'Esporte e Lazer';
    document.getElementById('q8_sim').checked = true;
    updateOdsVisibility();
    document.querySelectorAll('input[name="q9_ods"]').forEach(cb => {
      if (['Erradicação da Pobreza', 'Saúde e Bem-Estar', 'Redução das Desigualdades'].includes(cb.value)) {
        cb.checked = true;
      }
    });
    document.querySelector('input[name="q10_raca"][value="Sim"]').checked = true;
    document.querySelector('input[name="q11_genero"][value="Sim"]').checked = true;
    document.getElementById('q12_palavras_chave').value = 'esporte, bolsa atleta, pagamentos, beneficiarios, bolsa';
    document.getElementById('q13_cobertura_inicio').value = '2010-01-01';
    document.getElementById('q14_cobertura_fim').value = '2026-08-31';
    document.querySelector('input[name="q15_cobertura_espacial"][value="Federal"]').checked = true;
    document.querySelector('input[name="q16_granularidade_espacial"][value="Municipal"]').checked = true;
    document.getElementById('q17_versao').value = '1.0';
    document.querySelector('input[name="q18_atualizacao_versao"][value="Não"]').checked = true;
    document.querySelector('input[name="q19_descontinuado"][value="Não"]').checked = true;

    document.getElementById('q20_titulo_recurso').value = 'Tabela Consolidada de Pagamentos Bolsa Atleta 2024 - 2026';
    document.getElementById('q21_descricao_recurso').value = 'Arquivo CSV contendo dados de pagamento com número de edital, nome do atleta, categoria da bolsa e valor pago.';
    document.getElementById('q23_titulo_dicionario').value = 'Dicionário de Dados - Bolsa Atleta';
    document.getElementById('q24_descricao_dicionario').value = 'Especificação detalhada das colunas (ID_ATLETA, NOME, UF, CATEGORIA_BOLSA, VALOR_MENSAL).';

    setupOptionItemHighlighting();
    saveDraft();
    showToast('Dados de exemplo preenchidos com sucesso!');
  });

  // LocalStorage Draft Autosave (rascunho local, por usuário, antes do envio)
  function saveDraft() {
    const key = draftKey();
    if (!key) return;
    const data = getFormData();
    localStorage.setItem(key, JSON.stringify(data));
  }

  function loadDraft() {
    const key = draftKey();
    if (!key) return;
    const saved = localStorage.getItem(key);
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      for (let key in data) {
        const val = data[key];
        const field = form.elements[key];
        if (!field) continue;

        if (field instanceof NodeList || Array.isArray(field)) {
          field.forEach(el => {
            if (el.type === 'radio') {
              el.checked = (el.value === val);
            } else if (el.type === 'checkbox') {
              if (Array.isArray(val)) {
                el.checked = val.includes(el.value);
              }
            }
          });
        } else if (field.type === 'file') {
          // File input security: cannot set value
        } else {
          field.value = val;
        }
      }
      updateOdsVisibility();
      setupOptionItemHighlighting();
    } catch (e) {
      console.error('Erro ao carregar rascunho:', e);
    }
  }

  btnClearDraft?.addEventListener('click', () => {
    const key = draftKey();
    if (key) localStorage.removeItem(key);
    form.reset();
    updateOdsVisibility();
    setupOptionItemHighlighting();
    document.getElementById('preview-q22').innerHTML = '';
    document.getElementById('preview-q25').innerHTML = '';
    showToast('Rascunho limpo com sucesso.');
  });

  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  // Upload a file to Supabase Storage under the logged-in user's own folder
  async function uploadFileIfPresent(inputId, submissionId) {
    const input = document.getElementById(inputId);
    if (!input.files || !input.files[0]) return null;
    const file = input.files[0];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${currentUser.id}/${submissionId}/${inputId}-${safeName}`;

    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) {
      throw new Error(`Falha ao enviar o arquivo "${file.name}": ${error.message}`);
    }
    return { path, name: file.name };
  }

  // Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep1()) {
      goToStep(1);
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
      const submissionId = crypto.randomUUID();
      const data = getFormData();

      const file22 = await uploadFileIfPresent('q22_arquivo_recurso', submissionId);
      if (file22) {
        data.q22_arquivo_recurso = file22.name;
        data.q22_arquivo_recurso_path = file22.path;
      }

      const file25 = await uploadFileIfPresent('q25_arquivo_dicionario', submissionId);
      if (file25) {
        data.q25_arquivo_dicionario = file25.name;
        data.q25_arquivo_dicionario_path = file25.path;
      }

      const { error } = await sb.from('submissions').insert({
        id: submissionId,
        user_id: currentUser.id,
        area: currentProfile.area,
        data
      });
      if (error) throw error;

      const key = draftKey();
      if (key) localStorage.removeItem(key);
      form.reset();
      updateOdsVisibility();
      setupOptionItemHighlighting();
      document.getElementById('preview-q22').innerHTML = '';
      document.getElementById('preview-q25').innerHTML = '';
      goToStep(1);

      successModal.classList.add('show');
    } catch (err) {
      console.error(err);
      showToast(`Erro ao enviar formulário: ${err.message || err}`, 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Formulário';
    }
  });

  btnModalClose.addEventListener('click', () => {
    successModal.classList.remove('show');
  });

  // Print PDF
  btnPrint.addEventListener('click', () => {
    renderSummary();
    window.print();
  });

  // Toast Function
  function showToast(msg, type = 'info') {
    toastMessage.textContent = msg;
    if (type === 'error') {
      toast.style.background = '#dc2626';
    } else {
      toast.style.background = '#1e293b';
    }
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // ==========================================================================
  // AUTENTICAÇÃO (Supabase Auth) — login e senha reais, dois perfis
  // ==========================================================================

  function showLoginView() {
    currentUser = null;
    currentProfile = null;
    loginView.style.display = 'flex';
    forcePasswordView.style.display = 'none';
    userView.style.display = 'none';
    adminView.style.display = 'none';
    headerActions.style.display = 'none';
    btnToggleAdmin.style.display = 'none';
    loginForm.reset();
    loginError.style.display = 'none';
  }

  function showForcePasswordView() {
    loginView.style.display = 'none';
    userView.style.display = 'none';
    adminView.style.display = 'none';
    btnToggleAdmin.style.display = 'none';
    btnFillDemo.style.display = 'none';
    forcePasswordView.style.display = 'flex';
    forcePasswordForm.reset();
    forcePasswordError.style.display = 'none';
  }

  function showUserView() {
    loginView.style.display = 'none';
    forcePasswordView.style.display = 'none';
    adminView.style.display = 'none';
    btnFillDemo.style.display = '';
    userView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function showAdminView() {
    loginView.style.display = 'none';
    forcePasswordView.style.display = 'none';
    userView.style.display = 'none';
    btnFillDemo.style.display = '';
    adminView.style.display = 'block';
    await updateAdminUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onLoggedIn(user) {
    currentUser = user;

    const { data: profile, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      showToast('Não foi possível carregar seu perfil. Contate a CGTI.', 'error');
      await sb.auth.signOut();
      showLoginView();
      return;
    }

    currentProfile = profile;

    userBadgeText.textContent = `${profile.area || profile.email} • ${profile.role === 'master' ? 'CGTI (Master)' : 'Área'}`;
    headerActions.style.display = 'flex';

    if (profile.must_change_password) {
      showForcePasswordView();
      return;
    }

    if (profile.role === 'master') {
      btnToggleAdmin.style.display = 'inline-flex';
      await showAdminView();
    } else {
      btnToggleAdmin.style.display = 'none';
      showUserView();
      loadDraft();
      goToStep(1);
    }
  }

  async function fullLogout() {
    await sb.auth.signOut();
    showLoginView();
    showToast('Sessão encerrada.');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';

    if (error) {
      loginErrorText.textContent = 'E-mail ou senha incorretos.';
      loginError.style.display = 'block';
      return;
    }

    await onLoggedIn(data.user);
  });

  forcePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    forcePasswordError.style.display = 'none';

    const newPassword = forcePasswordNewInput.value;
    const confirmPassword = forcePasswordConfirmInput.value;

    if (newPassword.length < 6) {
      forcePasswordErrorText.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
      forcePasswordError.style.display = 'block';
      return;
    }
    if (newPassword !== confirmPassword) {
      forcePasswordErrorText.textContent = 'As senhas não coincidem.';
      forcePasswordError.style.display = 'block';
      return;
    }

    btnForcePasswordSubmit.disabled = true;
    btnForcePasswordSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
      const { error: updateAuthError } = await sb.auth.updateUser({ password: newPassword });
      if (updateAuthError) throw updateAuthError;

      const { error: updateProfileError } = await sb
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', currentUser.id);
      if (updateProfileError) throw updateProfileError;

      currentProfile.must_change_password = false;
      showToast('Senha definida com sucesso!');

      if (currentProfile.role === 'master') {
        btnToggleAdmin.style.display = 'inline-flex';
        await showAdminView();
      } else {
        showUserView();
        loadDraft();
        goToStep(1);
      }
    } catch (err) {
      forcePasswordErrorText.textContent = err.message || 'Erro ao definir a nova senha.';
      forcePasswordError.style.display = 'block';
    } finally {
      btnForcePasswordSubmit.disabled = false;
      btnForcePasswordSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Definir Senha e Continuar';
    }
  });

  btnToggleLoginPassword?.addEventListener('click', () => {
    if (loginPasswordInput.type === 'password') {
      loginPasswordInput.type = 'text';
      iconLoginEye.className = 'fa-solid fa-eye-slash';
    } else {
      loginPasswordInput.type = 'password';
      iconLoginEye.className = 'fa-solid fa-eye';
    }
  });

  btnLogout?.addEventListener('click', fullLogout);
  btnAdminLogout?.addEventListener('click', fullLogout);

  btnToggleAdmin.addEventListener('click', async () => {
    if (adminView.style.display === 'none') {
      await showAdminView();
    } else {
      showUserView();
    }
  });

  // ==========================================================================
  // PAINEL ADMIN (perfil master / CGTI) — lê as respostas do Supabase
  // ==========================================================================

  async function fetchSubmissions() {
    const { data, error } = await sb
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showToast(`Erro ao carregar respostas: ${error.message}`, 'error');
      return [];
    }

    return data.map(row => ({
      id: row.id,
      timestamp: new Date(row.created_at).toLocaleString('pt-BR'),
      area: row.area,
      data: row.data
    }));
  }

  async function updateAdminUI() {
    cachedSubmissions = await fetchSubmissions();
    renderAdminTable();
  }

  function renderAdminTable() {
    const list = cachedSubmissions;
    const adminBadgeCount = document.getElementById('admin-badge-count');
    const metricTotal = document.getElementById('metric-total');
    const metricAbertos = document.getElementById('metric-abertos');
    const metricOds = document.getElementById('metric-ods');
    const tbody = document.getElementById('admin-table-body');
    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();

    if (adminBadgeCount) adminBadgeCount.textContent = list.length;
    if (metricTotal) metricTotal.textContent = list.length;

    let abertosCount = 0;
    let odsCount = 0;

    list.forEach(item => {
      if (item.data.q1_dados_abertos === 'Aberto') abertosCount++;
      if (item.data.q8_relacao_ods === 'SIM') odsCount++;
    });

    if (metricAbertos) metricAbertos.textContent = abertosCount;
    if (metricOds) metricOds.textContent = odsCount;

    const filtered = list.filter(item => {
      if (!searchVal) return true;
      const text = `${item.id} ${item.area || ''} ${item.data.q2_titulo_base || ''} ${item.data.q4_area_tecnica || ''} ${item.data.q5_email_area || ''} ${item.data.q12_palavras_chave || ''}`.toLowerCase();
      return text.includes(searchVal);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
            ${list.length === 0 ? 'Nenhuma resposta enviada ainda pelas áreas.' : 'Nenhuma resposta encontrada para este termo de busca.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.area || 'Área não identificada')}</strong></td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(item.timestamp)}</td>
        <td style="font-weight: 600;">${escapeHtml(item.data.q2_titulo_base || 'Sem Título')}</td>
        <td>${escapeHtml(item.data.q4_area_tecnica || 'Não informada')}</td>
        <td>${escapeHtml(item.data.q6_periodicidade || 'N/A')}</td>
        <td>
          <span class="${item.data.q1_dados_abertos === 'Aberto' ? 'badge-aberto' : 'badge-nao-aberto'}">
            ${escapeHtml(item.data.q1_dados_abertos || 'N/A')}
          </span>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-action-icon" onclick="viewSubmissionDetail('${item.id}')" title="Ver Detalhes">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button type="button" class="btn-action-icon danger" onclick="deleteSubmission('${item.id}')" title="Excluir Resposta">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('admin-search-input')?.addEventListener('input', renderAdminTable);

  // Admin Modal & Detail Actions
  let activeDetailSubmission = null;
  const adminDetailModal = document.getElementById('admin-detail-modal');
  const adminModalBody = document.getElementById('admin-modal-body');
  const btnAdminModalClose = document.getElementById('btn-admin-modal-close');
  const btnAdminModalOk = document.getElementById('btn-admin-modal-ok');
  const btnAdminModalPrint = document.getElementById('btn-admin-modal-print');

  window.viewSubmissionDetail = function(id) {
    const item = cachedSubmissions.find(s => s.id === id);
    if (!item) return;

    activeDetailSubmission = item;
    adminModalBody.innerHTML = generateReportHTML(item.data, item.id, item.timestamp);
    adminDetailModal.classList.add('show');
  };

  window.deleteSubmission = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta resposta?')) return;
    const { error } = await sb.from('submissions').delete().eq('id', id);
    if (error) {
      showToast(`Erro ao excluir: ${error.message}`, 'error');
      return;
    }
    await updateAdminUI();
    showToast('Resposta excluída com sucesso.');
  };

  btnAdminModalClose?.addEventListener('click', () => adminDetailModal.classList.remove('show'));
  btnAdminModalOk?.addEventListener('click', () => adminDetailModal.classList.remove('show'));

  btnAdminModalPrint?.addEventListener('click', () => {
    if (!activeDetailSubmission) return;
    document.getElementById('summary-content').innerHTML = generateReportHTML(activeDetailSubmission.data, activeDetailSubmission.id, activeDetailSubmission.timestamp);
    window.print();
  });

  // ==========================================================================
  // Cadastro de novas áreas pelo Painel Admin (via Edge Function segura)
  // ==========================================================================
  const newAreaModal = document.getElementById('new-area-modal');
  const newAreaForm = document.getElementById('new-area-form');
  const newAreaNameInput = document.getElementById('new-area-name');
  const newAreaEmailInput = document.getElementById('new-area-email');
  const newAreaPasswordInput = document.getElementById('new-area-password');
  const newAreaError = document.getElementById('new-area-error');
  const newAreaErrorText = document.getElementById('new-area-error-text');
  const btnNewAreaSubmit = document.getElementById('btn-new-area-submit');
  const btnNewAreaCancel = document.getElementById('btn-new-area-cancel');

  document.getElementById('btn-admin-new-area')?.addEventListener('click', () => {
    newAreaForm.reset();
    newAreaError.style.display = 'none';
    newAreaModal.classList.add('show');
    setTimeout(() => newAreaNameInput.focus(), 150);
  });

  btnNewAreaCancel?.addEventListener('click', () => {
    newAreaModal.classList.remove('show');
  });

  newAreaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    newAreaError.style.display = 'none';
    btnNewAreaSubmit.disabled = true;
    btnNewAreaSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cadastrando...';

    const area = newAreaNameInput.value.trim();
    const email = newAreaEmailInput.value.trim();
    const password = newAreaPasswordInput.value;

    try {
      const { data, error } = await sb.functions.invoke('create-area-user', {
        body: { email, password, area }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      newAreaModal.classList.remove('show');
      showToast(`Área "${area}" cadastrada com sucesso!`);
    } catch (err) {
      newAreaErrorText.textContent = err.message || 'Erro ao cadastrar a área.';
      newAreaError.style.display = 'block';
    } finally {
      btnNewAreaSubmit.disabled = false;
      btnNewAreaSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar';
    }
  });

  // Admin Top Bar Buttons
  document.getElementById('btn-admin-export-csv')?.addEventListener('click', () => {
    const list = cachedSubmissions;
    if (!list.length) {
      showToast('Nenhuma resposta registrada para exportar.', 'error');
      return;
    }

    const headers = ['Área', 'Data / Hora', 'Título da Base de Dados', 'Área Técnica', 'Periodicidade', 'Abertura'];
    const csvRows = [headers.join(';')];

    list.forEach(item => {
      const d = item.data;
      const row = [
        `"${(item.area || '').replace(/"/g, '""')}"`,
        item.timestamp,
        `"${(d.q2_titulo_base || '').replace(/"/g, '""')}"`,
        `"${(d.q4_area_tecnica || '').replace(/"/g, '""')}"`,
        `"${(d.q6_periodicidade || '').replace(/"/g, '""')}"`,
        `"${(d.q1_dados_abertos || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '﻿' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respostas_dados_gov_br_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Relatório CSV exportado com sucesso!');
  });

  // ==========================================================================
  // Inicialização: verifica se já existe uma sessão válida
  // ==========================================================================
  (async function initAuth() {
    showLoginView();

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      await onLoggedIn(session.user);
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        showLoginView();
      }
    });
  })();
});
