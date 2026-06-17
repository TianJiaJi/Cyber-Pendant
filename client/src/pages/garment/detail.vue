<template>
  <view class="page-shell detail-page">
    <view class="phone-shell">
      <view class="detail-topbar">
        <button class="nav-button" hover-class="nav-button-hover" @click="goHome">
          返回
        </button>
        <text class="topbar-title">可追溯更放心</text>
        <view class="topbar-spacer"></view>
      </view>

      <view v-if="loading" class="state-shell">
        <view class="state-card">
          <text class="state-kicker">CYBER-PENDANT</text>
          <text class="state-title">正在读取吊牌信息</text>
          <text class="state-copy">正在核验溯源码，请稍候。</text>
        </view>
      </view>

      <view v-else-if="currentGarment" class="detail-content">
        <view :class="['verification-hero', isInactive ? 'inactive' : '']">
          <view class="hero-copy">
            <text class="hero-title">{{ isInactive ? '吊牌已停用' : '已通过质量检测' }}</text>
            <text class="hero-subtitle">
              {{ isInactive ? '当前不可作为有效溯源凭证' : '校服溯源 · 安心穿着' }}
            </text>
          </view>
          <view :class="['verified-seal', isInactive ? 'inactive' : '']">
            <text class="seal-main">{{ isInactive ? '停用' : '检验通过' }}</text>
            <text class="seal-sub">{{ isInactive ? 'INACTIVE' : 'VERIFIED' }}</text>
          </view>
        </view>

        <view :class="['assurance-card', isInactive ? 'inactive' : '']">
          <view class="assurance-title">
            <text>{{ isInactive ? '该吊牌当前已停用' : '您查询的校服为正品' }}</text>
            <text v-if="!isInactive">，当前查询次数 </text>
            <text v-if="!isInactive" class="query-count">{{ queryCountText }}</text>
            <text v-if="!isInactive"> 次</text>
          </view>
          <view class="assurance-copy">
            <text v-if="isInactive">
              {{ errorMessage || '如需确认状态，请联系生产企业。' }}
            </text>
            <text v-if="isInactive">累计查询次数 {{ queryCountText }} 次</text>
            <text v-else>信息来自 Cyber-Pendant 溯源系统</text>
          </view>
        </view>

        <view class="product-heading">
          <text class="product-name">{{ currentGarment.productName || '未命名校服' }}</text>
          <text class="trace-code">溯源码：{{ currentGarment.sn }}</text>
        </view>

        <view class="hangtag-card">
          <view class="tag-copy">
            <view v-for="item in tagFields" :key="item.label" class="tag-row">
              <text class="tag-label">{{ item.label }}：</text>
              <text class="tag-value">{{ item.value || '未录入' }}</text>
            </view>
          </view>

          <view class="tag-qr-panel">
            <image
              v-if="qrCodeSrc"
              class="qr-code"
              :src="qrCodeSrc"
              mode="aspectFit"
            />
            <text class="qr-caption">扫码复验</text>
          </view>
        </view>

        <button class="company-card" hover-class="company-card-hover" @click="toggleCompany">
          <view class="company-main">
            <text class="company-label">生产企业</text>
            <text class="company-name">{{ currentGarment.manufacturer || '未录入生产企业' }}</text>
          </view>
          <text class="company-action">{{ companyExpanded ? '收起' : '详情' }}</text>
        </button>

        <view v-if="companyExpanded" class="company-detail">
          <view v-for="item in companyFields" :key="item.label" class="company-row">
            <text class="company-row-label">{{ item.label }}</text>
            <text class="company-row-value">{{ item.value || '未录入' }}</text>
          </view>
        </view>

        <view class="binding-card">
          <view :class="['binding-badge', isBound ? 'bound' : '']">
            <text class="binding-badge-text">{{ isBound ? '已绑' : '身份' }}</text>
          </view>
          <view class="binding-copy">
            <text class="binding-title">{{ bindingTitle }}</text>
            <text class="binding-text">{{ bindingDescription }}</text>
          </view>
          <button
            :class="['bind-button', isBound || isInactive ? 'disabled' : '']"
            hover-class="bind-button-hover"
            @click="handleBind"
          >
            {{ isBound ? '已绑定' : isInactive ? '不可绑定' : '立即绑定' }}
          </button>
        </view>

        <view class="support-footer">
          <view class="footer-line"></view>
          <text class="support-text">Cyber-Pendant 提供技术支持</text>
          <view class="footer-line"></view>
        </view>
      </view>

      <view v-else-if="errorMessage" class="state-shell">
        <view class="state-card error">
          <text class="state-kicker">CYBER-PENDANT</text>
          <text class="state-title">未找到吊牌</text>
          <text class="state-copy">{{ errorMessage }}</text>
          <button class="state-action" hover-class="state-action-hover" @click="goHome">
            返回查询
          </button>
        </view>
      </view>

      <view v-if="bindingPanelVisible" class="bind-overlay">
        <view class="bind-panel" @click.stop>
          <view class="bind-panel-header">
            <text class="bind-panel-title">绑定学生信息</text>
            <button class="bind-close" hover-class="bind-close-hover" @click="closeBindingPanel">
              关闭
            </button>
          </view>

          <view class="bind-form">
            <view class="bind-field">
              <text class="bind-label">学生姓名</text>
              <input
                v-model="bindingForm.studentName"
                class="bind-input"
                maxlength="24"
                placeholder="例如 张三"
              />
            </view>
            <view class="bind-field">
              <text class="bind-label">学校</text>
              <input
                v-model="bindingForm.studentSchool"
                class="bind-input"
                maxlength="80"
                placeholder="例如 第一实验学校"
              />
            </view>
            <view class="bind-field">
              <text class="bind-label">班级</text>
              <input
                v-model="bindingForm.studentClass"
                class="bind-input"
                maxlength="40"
                placeholder="例如 三年级二班"
              />
            </view>
            <view class="bind-field">
              <text class="bind-label">联系人（可选）</text>
              <input
                v-model="bindingForm.contactName"
                class="bind-input"
                maxlength="24"
                placeholder="例如 张女士"
              />
            </view>
            <view class="bind-field">
              <text class="bind-label">联系电话</text>
              <input
                v-model="bindingForm.contactPhone"
                class="bind-input"
                type="tel"
                maxlength="20"
                placeholder="手机号或固定电话"
              />
            </view>
            <text class="bind-help">公开页面仅展示脱敏姓名、学校班级和电话尾号；后台可查看完整信息并解绑。</text>
            <text v-if="bindingMessage" class="bind-message">{{ bindingMessage }}</text>
          </view>

          <button
            class="bind-submit"
            :disabled="bindingSubmitting"
            hover-class="bind-submit-hover"
            @click="submitBinding"
          >
            {{ bindingSubmitting ? '绑定中' : '确认绑定' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { bindPublicGarment, getPublicGarment, qrcodeUrl } from '../../utils/api.js';

const loading = ref(true);
const garment = ref(null);
const inactiveGarment = ref(null);
const errorMessage = ref('');
const companyExpanded = ref(false);
const bindingPanelVisible = ref(false);
const bindingSubmitting = ref(false);
const bindingMessage = ref('');
const bindingForm = ref({
  studentName: '',
  studentSchool: '',
  studentClass: '',
  contactName: '',
  contactPhone: ''
});

const currentGarment = computed(() => garment.value || inactiveGarment.value);

const isInactive = computed(() => {
  const current = currentGarment.value;
  return Boolean(current && current.status !== 'active');
});

const qrCodeSrc = computed(() => {
  const current = currentGarment.value;
  return current?.sn ? qrcodeUrl(current.sn, 'url') : '';
});

const queryCountText = computed(() => {
  const current = currentGarment.value;
  return String(Number(current?.queryCount || 0));
});

const ownerInfo = computed(() => currentGarment.value?.owner || null);
const isBound = computed(() => Boolean(ownerInfo.value));

const bindingTitle = computed(() => {
  if (isBound.value) {
    return '该校服已绑定学生';
  }

  if (isInactive.value) {
    return '该校服暂不可绑定';
  }

  return '该校服暂未绑定学生';
});

const bindingDescription = computed(() => {
  if (isBound.value) {
    const pieces = [
      ownerInfo.value?.name || '已绑定',
      ownerInfo.value?.school,
      ownerInfo.value?.className
    ].filter(Boolean);
    const phoneText = ownerInfo.value?.phoneTail
      ? `电话尾号 ${ownerInfo.value.phoneTail}`
      : '身份信息已留存';
    return [...pieces, phoneText].join(' · ');
  }

  if (isInactive.value) {
    return '吊牌停用后不能绑定学生信息';
  }

  return '录入学生信息后，后台可查看并支持解绑';
});

const tagFields = computed(() => {
  const current = currentGarment.value;
  if (!current) {
    return [];
  }

  return [
    { label: '商品名称', value: current.productName },
    { label: '款号', value: current.styleNo },
    { label: '颜色尺码', value: [current.color, current.size].filter(Boolean).join(' / ') },
    { label: '生产批次', value: current.batchNo },
    { label: '生产日期', value: current.productionDate },
    { label: '执行标准', value: current.standard },
    { label: '安全类别', value: current.safetyCategory },
    { label: '质量等级', value: current.grade },
    { label: '面料成分', value: current.fabric },
    { label: '洗护说明', value: current.careInstructions },
    { label: '厂家信息', value: current.manufacturer }
  ];
});

const companyFields = computed(() => {
  const current = currentGarment.value;
  if (!current) {
    return [];
  }

  return [
    { label: '企业名称', value: current.manufacturer },
    { label: '企业地址', value: current.manufacturerAddress },
    { label: '备注信息', value: current.remark }
  ];
});

onLoad(async (query) => {
  const sn = String(query?.sn || '').trim().toUpperCase();

  if (!sn) {
    loading.value = false;
    errorMessage.value = '链接中没有 SN 参数，请返回首页重新输入。';
    return;
  }

  try {
    const response = await getPublicGarment(sn);
    garment.value = response.garment;
  } catch (error) {
    if (error.statusCode === 423) {
      inactiveGarment.value = error.data?.garment;
      errorMessage.value = error.message || '该吊牌已停用。';
    } else {
      errorMessage.value = error.message || '未找到该吊牌信息。';
    }
  } finally {
    loading.value = false;
  }
});

function goHome() {
  uni.reLaunch({
    url: '/pages/index/index'
  });
}

function toggleCompany() {
  companyExpanded.value = !companyExpanded.value;
}

function handleBind() {
  if (isBound.value) {
    uni.showToast({
      title: '该校服已绑定',
      icon: 'none'
    });
    return;
  }

  if (isInactive.value) {
    uni.showToast({
      title: '停用吊牌不可绑定',
      icon: 'none'
    });
    return;
  }

  bindingMessage.value = '';
  bindingPanelVisible.value = true;
}

function closeBindingPanel() {
  if (bindingSubmitting.value) {
    return;
  }

  bindingPanelVisible.value = false;
  bindingMessage.value = '';
}

function normalizeContactPhone() {
  return bindingForm.value.contactPhone.replace(/\D/g, '').slice(0, 20);
}

function emptyBindingForm() {
  return {
    studentName: '',
    studentSchool: '',
    studentClass: '',
    contactName: '',
    contactPhone: ''
  };
}

async function submitBinding() {
  const studentName = bindingForm.value.studentName.trim();
  const studentSchool = bindingForm.value.studentSchool.trim();
  const studentClass = bindingForm.value.studentClass.trim();
  const contactName = bindingForm.value.contactName.trim();
  const contactPhone = normalizeContactPhone();
  bindingForm.value.contactPhone = contactPhone;
  bindingMessage.value = '';

  if (!studentName) {
    bindingMessage.value = '请输入学生姓名。';
    return;
  }

  if (!studentSchool) {
    bindingMessage.value = '请输入学校。';
    return;
  }

  if (!studentClass) {
    bindingMessage.value = '请输入班级。';
    return;
  }

  if (!/^\d{6,20}$/.test(contactPhone)) {
    bindingMessage.value = '请输入 6-20 位联系电话。';
    return;
  }

  bindingSubmitting.value = true;

  try {
    const response = await bindPublicGarment(currentGarment.value.sn, {
      studentName,
      studentSchool,
      studentClass,
      contactName,
      contactPhone
    });
    garment.value = response.garment;
    inactiveGarment.value = null;
    bindingPanelVisible.value = false;
    bindingForm.value = emptyBindingForm();
    uni.showToast({
      title: '绑定成功',
      icon: 'success'
    });
  } catch (error) {
    bindingMessage.value = error.message || '绑定失败，请稍后再试。';
  } finally {
    bindingSubmitting.value = false;
  }
}

</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f7f3ec;
}

.phone-shell {
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 244, 237, 0.96) 18%, #f7f3ec 100%);
  color: #151515;
  box-shadow: 0 0 0 1px rgba(36, 31, 24, 0.04);
}

.detail-topbar {
  display: grid;
  grid-template-columns: 128rpx minmax(0, 1fr) 128rpx;
  align-items: center;
  min-height: 108rpx;
  padding: 0 34rpx;
  border-bottom: 1px solid rgba(210, 202, 190, 0.78);
  background: rgba(255, 255, 255, 0.82);
}

.nav-button,
.state-action,
.company-card,
.bind-button,
.bind-close,
.bind-submit {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: normal;
}

.nav-button::after,
.state-action::after,
.company-card::after,
.bind-button::after,
.bind-close::after,
.bind-submit::after {
  border: 0;
}

.nav-button {
  min-height: 64rpx;
  padding: 0;
  text-align: left;
  font-size: 28rpx;
  font-weight: 600;
}

.nav-button-hover {
  color: #6b8f62;
}

.topbar-title {
  min-width: 0;
  text-align: center;
  font-size: 32rpx;
  font-weight: 680;
  line-height: 1.2;
}

.topbar-spacer {
  min-height: 1px;
}

.state-shell {
  padding: 42rpx 36rpx;
}

.state-card {
  padding: 42rpx 36rpx;
  border: 1px solid #ded5c9;
  border-radius: 18rpx;
  background: rgba(255, 252, 245, 0.94);
  box-shadow: 0 14rpx 34rpx rgba(74, 63, 45, 0.08);
}

.state-card.error {
  border-color: #e0c4bc;
  background: #fff9f6;
}

.state-kicker,
.state-title,
.state-copy {
  display: block;
}

.state-kicker {
  color: #7b756c;
  font-size: 22rpx;
  font-weight: 700;
}

.state-title {
  margin-top: 18rpx;
  color: #161616;
  font-size: 40rpx;
  font-weight: 720;
}

.state-copy {
  margin-top: 14rpx;
  color: #656058;
  font-size: 28rpx;
  line-height: 1.7;
}

.state-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 78rpx;
  margin-top: 30rpx;
  padding: 0 32rpx;
  border-radius: 8rpx;
  background: #171717;
  color: #fff;
  font-size: 28rpx;
  font-weight: 650;
}

.state-action-hover {
  background: #2c2c2c;
}

.detail-content {
  padding-bottom: 54rpx;
}

.verification-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28rpx;
  padding: 58rpx 38rpx 34rpx;
  border-bottom: 1px solid rgba(216, 207, 193, 0.82);
}

.verification-hero.inactive {
  background: rgba(255, 249, 246, 0.56);
}

.hero-copy {
  min-width: 0;
  flex: 1;
}

.hero-title,
.hero-subtitle,
.seal-main,
.seal-sub {
  display: block;
}

.hero-title {
  color: #121212;
  font-size: 46rpx;
  font-weight: 760;
  line-height: 1.18;
}

.hero-subtitle {
  margin-top: 22rpx;
  color: #777168;
  font-size: 28rpx;
  line-height: 1.5;
}

.verified-seal {
  width: 142rpx;
  height: 142rpx;
  flex: 0 0 142rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 3rpx double #7aa06f;
  border-radius: 999rpx;
  color: #6e965f;
  transform: rotate(-12deg);
  background: rgba(250, 255, 247, 0.58);
}

.verified-seal.inactive {
  border-color: #b68172;
  color: #9a4a35;
  background: rgba(255, 248, 244, 0.72);
}

.seal-main {
  font-size: 22rpx;
  font-weight: 760;
  letter-spacing: 0;
}

.seal-sub {
  margin-top: 8rpx;
  font-size: 18rpx;
  font-weight: 700;
}

.assurance-card {
  margin: 34rpx 36rpx 0;
  padding: 32rpx 36rpx;
  border: 1px solid #ded5c8;
  border-radius: 16rpx;
  background: rgba(255, 252, 245, 0.86);
}

.assurance-card.inactive {
  border-color: #e4c8be;
  background: rgba(255, 249, 246, 0.9);
}

.assurance-title,
.assurance-copy,
.product-name,
.trace-code {
  display: block;
}

.assurance-title {
  color: #151515;
  font-size: 30rpx;
  font-weight: 690;
  line-height: 1.5;
}

.query-count {
  color: #5f8f55;
  font-size: 36rpx;
  font-weight: 780;
}

.assurance-copy {
  margin-top: 14rpx;
  color: #777168;
  font-size: 28rpx;
  line-height: 1.55;
}

.product-heading {
  padding: 44rpx 38rpx 26rpx;
}

.product-name {
  color: #111;
  font-size: 40rpx;
  font-weight: 760;
  line-height: 1.28;
  word-break: break-word;
}

.trace-code {
  margin-top: 18rpx;
  color: #777168;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 26rpx;
  line-height: 1.45;
  word-break: break-all;
}

.hangtag-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 154rpx;
  gap: 22rpx;
  margin: 0 36rpx;
  padding: 34rpx 26rpx 30rpx 34rpx;
  border: 1px solid #d5cab9;
  border-radius: 18rpx;
  background:
    linear-gradient(135deg, rgba(255, 253, 246, 0.96), rgba(248, 244, 233, 0.96));
  box-shadow:
    0 18rpx 34rpx rgba(80, 68, 45, 0.16),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.9);
}

.tag-copy {
  min-width: 0;
}

.tag-row {
  display: grid;
  grid-template-columns: 138rpx minmax(0, 1fr);
  gap: 10rpx;
  padding: 14rpx 0;
  border-bottom: 1px dashed rgba(176, 163, 144, 0.62);
}

.tag-row:first-child {
  padding-top: 0;
}

.tag-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.tag-label,
.tag-value {
  display: block;
  color: #161616;
  font-size: 26rpx;
  line-height: 1.55;
}

.tag-label {
  font-weight: 760;
  white-space: nowrap;
}

.tag-value {
  min-width: 0;
  word-break: break-word;
}

.tag-qr-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-left: 22rpx;
  border-left: 1px dashed rgba(176, 163, 144, 0.76);
}

.qr-code {
  width: 116rpx;
  height: 116rpx;
}

.qr-caption {
  display: block;
  margin-top: 14rpx;
  color: #8a8379;
  font-size: 20rpx;
  line-height: 1.25;
  text-align: center;
}

.company-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  width: auto;
  min-height: 112rpx;
  margin: 36rpx 36rpx 0;
  padding: 0 32rpx;
  border: 1px solid #ded5c9;
  border-radius: 16rpx;
  background: rgba(255, 252, 246, 0.9);
  text-align: left;
}

.company-card-hover {
  background: #fffaf0;
}

.company-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 18rpx;
}

.company-label {
  flex: 0 0 auto;
  color: #171717;
  font-size: 30rpx;
  font-weight: 720;
  line-height: 1.3;
}

.company-name {
  min-width: 0;
  color: #777168;
  font-size: 28rpx;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.company-action {
  flex: 0 0 auto;
  color: #252525;
  font-size: 26rpx;
  font-weight: 650;
}

.company-detail {
  margin: 16rpx 36rpx 0;
  padding: 24rpx 30rpx;
  border: 1px solid #e3dacd;
  border-radius: 14rpx;
  background: rgba(255, 252, 246, 0.72);
}

.company-row {
  display: grid;
  grid-template-columns: 136rpx minmax(0, 1fr);
  gap: 14rpx;
  padding: 12rpx 0;
}

.company-row-label,
.company-row-value {
  display: block;
  font-size: 25rpx;
  line-height: 1.55;
}

.company-row-label {
  color: #777168;
}

.company-row-value {
  color: #242424;
  word-break: break-word;
}

.binding-card {
  display: grid;
  grid-template-columns: 96rpx minmax(0, 1fr) 182rpx;
  align-items: center;
  gap: 24rpx;
  min-height: 138rpx;
  margin: 36rpx 36rpx 0;
  padding: 26rpx 28rpx;
  border: 1px solid #ded5c9;
  border-radius: 16rpx;
  background: rgba(255, 252, 246, 0.92);
}

.binding-badge {
  width: 86rpx;
  height: 86rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: #eee9df;
  color: #5f584d;
}

.binding-badge.bound {
  background: #edf4ea;
  color: #5f8f55;
}

.binding-badge-text {
  font-size: 24rpx;
  font-weight: 700;
}

.binding-copy {
  min-width: 0;
}

.binding-title,
.binding-text {
  display: block;
}

.binding-title {
  color: #151515;
  font-size: 30rpx;
  font-weight: 720;
  line-height: 1.35;
}

.binding-text {
  margin-top: 10rpx;
  color: #777168;
  font-size: 24rpx;
  line-height: 1.45;
}

.bind-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 76rpx;
  padding: 0 22rpx;
  border-radius: 8rpx;
  background: #171717;
  color: #fff;
  font-size: 28rpx;
  font-weight: 650;
}

.bind-button-hover {
  background: #2b2b2b;
}

.bind-button.disabled {
  background: #eee9df;
  color: #746d62;
}

.support-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  padding: 44rpx 36rpx 0;
}

.footer-line {
  width: 68rpx;
  height: 1px;
  background: #dad2c7;
}

.support-text {
  color: #8a8379;
  font-size: 24rpx;
  line-height: 1.4;
  text-align: center;
}

.bind-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 32rpx;
  background: rgba(20, 18, 15, 0.42);
}

.bind-panel {
  width: 100%;
  max-width: 444px;
  max-height: calc(100vh - 64rpx);
  display: flex;
  flex-direction: column;
  padding: 34rpx;
  border: 1px solid #ded5c9;
  border-radius: 22rpx 22rpx 14rpx 14rpx;
  background: #fffdf7;
  box-shadow: 0 -20rpx 60rpx rgba(25, 21, 15, 0.18);
}

.bind-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.bind-panel-title {
  color: #151515;
  font-size: 34rpx;
  font-weight: 760;
  line-height: 1.3;
}

.bind-close {
  flex: 0 0 auto;
  min-height: 58rpx;
  padding: 0 4rpx;
  color: #777168;
  font-size: 26rpx;
}

.bind-close-hover {
  color: #151515;
}

.bind-form {
  display: grid;
  gap: 22rpx;
  margin-top: 28rpx;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4rpx;
}

.bind-field {
  display: grid;
  gap: 12rpx;
}

.bind-label,
.bind-help,
.bind-message {
  display: block;
}

.bind-label {
  color: #5f584d;
  font-size: 25rpx;
  font-weight: 650;
}

.bind-input {
  width: 100%;
  min-height: 86rpx;
  padding: 0 24rpx;
  border: 1px solid #d8d1c7;
  border-radius: 10rpx;
  background: #fffaf1;
  color: #151515;
  font-size: 28rpx;
}

.bind-help {
  color: #827a70;
  font-size: 24rpx;
  line-height: 1.55;
}

.bind-message {
  color: #9a3a2b;
  font-size: 24rpx;
  line-height: 1.45;
}

.bind-submit {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 86rpx;
  margin-top: 30rpx;
  border-radius: 10rpx;
  background: #171717;
  color: #fff;
  font-size: 29rpx;
  font-weight: 700;
}

.bind-submit-hover {
  background: #2b2b2b;
}

.bind-submit[disabled] {
  background: #b8b1a7;
  color: #fff;
}

@media (min-width: 720px) {
  .detail-page {
    padding: 24px 0;
  }

  .phone-shell {
    border-radius: 18px;
    overflow: hidden;
    box-shadow:
      0 24px 80px rgba(38, 32, 24, 0.14),
      0 0 0 1px rgba(44, 36, 26, 0.06);
  }
}
</style>
