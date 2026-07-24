/**
 * Configures the renderer Redux store and typed React hooks.
 */

import { configureStore } from '@reduxjs/toolkit'
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import appReducer from './appSlice'

const store = configureStore({
  reducer: { app: appReducer },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

/** Returns the strongly typed renderer dispatch function. */
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>()

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

export default store
