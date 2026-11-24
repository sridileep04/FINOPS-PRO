{{- define "finops.labels" -}}
app.kubernetes.io/name: finops
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Values.global.imageTag | quote }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "finops.selector" -}}
app.kubernetes.io/name: finops
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "finops.image" -}}
{{- $reg := .root.Values.global.imageRegistry -}}
{{- $tag := default .root.Values.global.imageTag .image.tag -}}
{{- if $reg -}}{{ $reg }}/{{ .image.repository }}:{{ $tag }}{{- else -}}{{ .image.repository }}:{{ $tag }}{{- end -}}
{{- end -}}

{{- define "finops.containerSecurityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}

{{- define "finops.spread" -}}
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "finops.selector" . | nindent 8 }}
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "finops.selector" . | nindent 8 }}
{{- end -}}