import type { LogRecord, PageResult } from '../types';
import { request, type QueryValue } from './request';

export const logApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<LogRecord>>('/logs', {}, query),
};
