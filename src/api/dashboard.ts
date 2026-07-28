import type { DashboardData } from '../types';
import { request } from './request';

export const dashboardApi = {
  getDashboard: () => request<DashboardData>('/dashboard'),
};
