// === Supabase 配置 ===
const supabaseUrl = 'https://hppsjmveutqmdsuvgrvb.supabase.co'; // 替换为你的
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHNqbXZldXRxbWRzdXZncnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMDYzNDksImV4cCI6MjA2Njg4MjM0OX0.-tl4hkGnALnLT0UlT7B1ImzMoiM17OFJYHzECKrR8zM'; // 替换为你的
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// === 用户标识（本地存储）===
function getUserId() {
  let userId = localStorage.getItem('user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('user_id', userId);
  }
  return userId;
}
const USER_ID = getUserId();

// 当前选中的日期
let selectedDateId = null;

// ============= DOM Elements =============
const dateListEl = document.getElementById('date-list');
const addDateBtn = document.getElementById('add-date-btn');
const datePicker = document.getElementById('date-picker');
const saveDateBtn = document.getElementById('save-date-btn');
const uploadSection = document.getElementById('upload-section');
const galleryEl = document.getElementById('gallery');

// ============= 初始化 =============
async function init() {
  await loadDates();
  bindEventListeners();
}

// ============= 加载日期列表 =============
async function loadDates() {
  const { data, error } = await supabase
    .from('dates')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    alert('加载日期失败');
    console.error(error);
    return;
  }

  dateListEl.innerHTML = '';
  data.forEach(date => {
    const li = document.createElement('li');
    li.className = 'date-item';
    li.dataset.id = date.id;
    li.innerHTML = `
      ${new Date(date.date).toLocaleDateString('zh-CN')} 
      <button class="delete-date">×</button>
    `;
    li.addEventListener('click', async (e) => {
      if (e.target.classList.contains('delete-date')) {
        await deleteDate(date.id);
      } else {
        selectDate(date.id, date.date);
      }
    });
    dateListEl.appendChild(li);
  });
}

// ============= 选择日期 =============
async function selectDate(id, dateStr) {
  selectedDateId = id;
  document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.date-item[data-id="${id}"]`)?.classList.add('active');
  await renderUploadSection(dateStr);
  await loadGallery(id);
}

// ============= 删除日期 =============
async function deleteDate(id) {
  if (!confirm('删除此日期会同时删除所有相关照片，确定吗？')) return;

  const { error } = await supabase
    .from('dates')
    .delete()
    .eq('id', id);

  if (error) {
    alert('删除失败');
  } else {
    selectedDateId = null;
    galleryEl.innerHTML = '';
    uploadSection.innerHTML = '';
    await loadDates();
  }
}

// ============= 添加日期 =============
addDateBtn.addEventListener('click', () => {
  const today = new Date().toISOString().split('T')[0];
  datePicker.value = today;
});

saveDateBtn.addEventListener('click', async () => {
  const dateStr = datePicker.value;
  if (!dateStr) {
    alert('请选择日期');
    return;
  }

  const formattedDate = dateStr; // YYYY-MM-DD
  const title = dateStr.replace(/-/g, '/');

  const { data, error } = await supabase
    .from('dates')
    .insert([{ title, date: formattedDate }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      alert('该日期已存在');
    } else {
      alert('添加失败');
    }
  } else {
    await loadDates();
  }
});

// ============= 渲染上传区域 =============
async function renderUploadSection(dateStr) {
  uploadSection.innerHTML = `
    <div class="upload-form">
      <h3>上传照片 - ${dateStr}</h3>
      <input type="file" id="file-input" accept="image/*" multiple />
      <button id="upload-btn">📤 上传</button>
    </div>
  `;

  document.getElementById('upload-btn').addEventListener('click', handleUpload);
}

// ============= 处理上传 =============
async function handleUpload() {
  const fileInput = document.getElementById('file-input');
  const files = fileInput.files;
  if (!files.length || !selectedDateId) return;

  for (let file of files) {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `photos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, file);

    if (uploadError) {
      alert(`上传失败: ${file.name}`);
      continue;
    }

    // 获取公共 URL
    const { data } = supabase.storage.from('photos').getPublicUrl(filePath);

    // 存入 photos 表
    await supabase.from('photos').insert([
      { date_id: selectedDateId, image_path: data.publicUrl }
    ]);
  }

  fileInput.value = '';
  await loadGallery(selectedDateId);
}

// ============= 加载画廊 =============
async function loadGallery(dateId) {
  const {  photos, error } = await supabase
    .from('photos')
    .select('*')
    .eq('date_id', dateId);

  if (error || !photos) {
    galleryEl.innerHTML = '<p>暂无照片</p>';
    return;
  }

  // 获取点赞状态
  const photoIds = photos.map(p => p.id);
  const {  likes } = await supabase
    .from('likes')
    .select('photo_id')
    .eq('user_id', USER_ID)
    .in('photo_id', photoIds);

  const likedPhotoIds = likes ? likes.map(l => l.photo_id) : [];

  galleryEl.innerHTML = '';
  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `
      <img src="${photo.image_path}" alt="Photo" />
      <div class="photo-footer">
        <span class="heart ${likedPhotoIds.includes(photo.id) ? 'liked' : ''}" data-id="${photo.id}">♡</span>
        <button class="delete-photo" data-id="${photo.id}">×</button>
      </div>
    `;
    card.querySelector('.heart').addEventListener('click', toggleLike);
    card.querySelector('.delete-photo').addEventListener('click', () => deletePhoto(photo.id));
    galleryEl.appendChild(card);
  });
}

// ============= 点赞功能 =============
async function toggleLike(e) {
  const button = e.currentTarget;
  const photoId = button.dataset.id;
  const isLiked = button.classList.contains('liked');

  if (isLiked) {
    // 取消点赞
    await supabase
      .from('likes')
      .delete()
      .eq('photo_id', photoId)
      .eq('user_id', USER_ID);
    button.classList.remove('liked');
  } else {
    // 添加点赞
    await supabase
      .from('likes')
      .upsert({ photo_id: photoId, user_id: USER_ID, liked: true }, { onConflict: 'photo_id,user_id' });
    button.classList.add('liked');
  }
}

// ============= 删除照片 =============
async function deletePhoto(photoId) {
  if (!confirm('确定要删除这张照片吗？')) return;

  // 先从数据库删除
  const { error } = await supabase.from('photos').delete().eq('id', photoId);
  if (error) {
    alert('删除失败');
    return;
  }

  // 刷新当前画廊
  await loadGallery(selectedDateId);
}

// ============= 绑定事件 =============
function bindEventListeners() {
  // 初始加载
  window.addEventListener('load', init);
}

// 启动
init();