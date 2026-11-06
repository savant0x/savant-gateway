export function createPelicanSdf(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance"
  });
  if (!gl) throw new Error("Pelican SDF requires WebGL2.");

  const vertexSource = `#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const fragmentSource = `#version 300 es
  precision highp float;
  out vec4 outColor;
  uniform vec2 uResolution, uWheel, uCrank;
  uniform vec3 uEye, uRight, uUp, uForward;
  uniform vec3 uPedalA, uPedalB, uKneeA, uKneeB;

  const vec3 LIGHT = vec3(-0.430, 0.765, 0.478);
  const vec3 CRANK = vec3(-0.18, 0.89, 0.0);

  float box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }
  float roundedBox(vec3 p, vec3 b, float r) {
    return box(p, b) - r;
  }
  float egg(vec3 p, vec3 r) {
    float k = length(p / r);
    return k < 0.0001 ? -min(r.x,min(r.y,r.z))
      : k * (k - 1.0) / length(p / (r * r));
  }
  float rod(vec3 p, vec3 a, vec3 b, float r) {
    vec3 v = b-a, q = p-a;
    return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0))-r;
  }
  float taper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
    vec3 v = b-a, q = p-a;
    float h = clamp(dot(q,v)/dot(v,v),0.0,1.0);
    return (length(q-v*h)-mix(ra,rb,h))*0.94;
  }
  float cylinderZ(vec3 p, float r, float h) {
    vec2 q = vec2(length(p.xy)-r,abs(p.z)-h);
    return min(max(q.x,q.y),0.0)+length(max(q,0.0));
  }
  float smoothUnion(float a, float b, float k) {
    float h = max(k-abs(a-b),0.0)/k;
    return min(a,b)-h*h*k*0.25;
  }
  vec2 turn(vec2 p, float a) {
    float c=cos(a), s=sin(a);
    return vec2(c*p.x-s*p.y,s*p.x+c*p.y);
  }
  void add(inout vec2 r, float d, float m) {
    if(d<r.x) r=vec2(d,m);
  }
  vec2 closer(vec2 a, vec2 b) { return a.x<b.x?a:b; }

  vec2 wheels(vec3 p) {
    vec3 q = p-vec3(p.x<0.0?-1.2:1.2,0.74,0.0);
    float r=length(q.xy);
    vec2 h=vec2(length(vec2(r-0.656,q.z))-0.066,2.0);
    add(h,length(vec2(r-0.588,q.z))-0.027,3.0);
    add(h,cylinderZ(q,0.091,0.126),15.0);
    add(h,cylinderZ(q,0.044,0.174),3.0);
    vec2 v=vec2(uWheel.x*q.x-uWheel.y*q.y,
                uWheel.y*q.x+uWheel.x*q.y);
    float a=mod(atan(v.y,v.x)+0.19634954,0.39269908)-0.19634954;
    vec3 s=vec3(r*cos(a),r*sin(a),q.z);
    add(h,rod(s,vec3(0.075,-0.038,-0.053),vec3(0.587,0.0,0.007),0.0065),3.0);
    add(h,rod(s,vec3(0.075,0.038,0.053),vec3(0.587,0.0,-0.007),0.0065),3.0);
    float f=length(vec2(r-0.764,max(abs(q.z)-0.049,0.0)))-0.020;
    add(h,max(f,0.105-q.y),11.0);
    return h;
  }

  vec2 leg(vec3 p, float side, vec3 pedal, vec3 knee) {
    vec3 hip=vec3(-0.49,2.08,side*0.23);
    vec3 ankle=pedal+vec3(-0.045,0.15,0.0);
    vec2 h=vec2(taper(p,hip,knee,0.062,0.049),7.0);
    add(h,rod(p,knee,ankle,0.039),7.0);
    add(h,length(p-knee)-0.060,7.0);
    vec3 foot=pedal+vec3(0.055,0.105,0.0);
    add(h,egg(p-foot,vec3(0.205,0.073,0.146)),7.0);
    for(int i=0;i<3;i++) {
      float z=float(i-1)*0.082;
      add(h,rod(p,foot+vec3(0.07,-0.016,z*0.75),
                        foot+vec3(0.19,-0.022,z),0.027),7.0);
    }
    vec3 c=vec3(CRANK.xy,side*0.205);
    vec3 end=vec3(pedal.xy,side*0.205);
    add(h,rod(p,c,end,0.029),3.0);
    add(h,rod(p,end,pedal,0.024),3.0);
    add(h,roundedBox(p-pedal-vec3(0.035,0.0,0.0),
                         vec3(0.145,0.030,0.105),0.018),10.0);
    add(h,roundedBox(p-pedal-vec3(0.035,0.035,0.0),
                         vec3(0.130,0.005,0.091),0.006),2.0);
    return h;
  }

  vec2 frame(vec3 p) {
    vec2 h=vec2(100.0,4.0);
    vec3 rear=vec3(-1.2,0.74,0.0);
    vec3 seat=vec3(-0.53,1.75,0.0);
    vec3 head=vec3(0.86,1.76,0.0);
    vec3 low=vec3(0.98,1.45,0.0);
    add(h,rod(p,seat,head,0.046),4.0);
    add(h,rod(p,low,CRANK,0.052),4.0);
    add(h,rod(p,seat,CRANK,0.047),4.0);
    add(h,rod(p,head,low,0.063),4.0);
    vec3 q=vec3(p.xy,abs(p.z));
    add(h,rod(q,vec3(rear.xy,0.13),vec3(seat.xy,0.055),0.028),4.0);
    add(h,rod(q,vec3(rear.xy,0.13),vec3(CRANK.xy,0.09),0.031),4.0);
    add(h,rod(q,vec3(low.xy,0.075),vec3(1.2,0.74,0.13),0.039),4.0);
    add(h,rod(p,seat,vec3(-0.61,1.98,0.0),0.030),3.0);
    add(h,rod(p,head,vec3(0.79,2.04,0.0),0.029),3.0);
    add(h,rod(p,vec3(0.79,2.04,0.0),vec3(1.02,2.13,0.0),0.030),3.0);
    add(h,rod(p,vec3(1.02,2.13,-0.33),vec3(1.02,2.13,0.33),0.027),3.0);
    add(h,rod(q,vec3(1.02,2.13,0.30),vec3(0.85,2.13,0.47),0.040),10.0);
    add(h,egg(p-vec3(-0.67,2.0,0.0),vec3(0.29,0.077,0.184)),10.0);
    add(h,egg(p-vec3(-0.43,1.995,0.0),vec3(0.18,0.061,0.108)),10.0);
    for(int i=0;i<3;i++) {
      add(h,length(q-vec3(-0.82+float(i)*0.115,2.01,0.171))-0.013,15.0);
    }
    add(h,length(p-vec3(0.98,2.20,0.24))-0.067,15.0);
    add(h,rod(p,vec3(1.02,2.19,0.28),vec3(1.06,2.20,0.30),0.014),3.0);
    add(h,rod(p,vec3(1.05,1.57,0.0),vec3(1.10,1.68,0.0),0.023),3.0);
    add(h,egg(p-vec3(1.105,1.69,0.0),vec3(0.112,0.095,0.095)),15.0);
    add(h,egg(p-vec3(1.193,1.69,0.0),vec3(0.023,0.073,0.073)),11.0);

    vec3 c=p-vec3(CRANK.xy,0.17);
    float r=length(c.xy);
    add(h,length(vec2(r-0.199,c.z))-0.021,15.0);
    add(h,cylinderZ(p-CRANK,0.064,0.224),3.0);
    vec2 v=vec2(uCrank.x*c.x-uCrank.y*c.y,
                uCrank.y*c.x+uCrank.x*c.y);
    float a=mod(atan(v.y,v.x)+0.62831853,1.25663706)-0.62831853;
    vec3 t=vec3(r*cos(a),r*sin(a),c.z);
    add(h,rod(t,vec3(0.048,0.0,0.0),vec3(0.194,0.0,0.0),0.019),15.0);
    float chain=length(vec2(r-0.225,p.z-0.185))-0.009;
    chain=min(chain,length(vec2(length(p.xy-rear.xy)-0.095,p.z-0.185))-0.009);
    chain=min(chain,rod(p,vec3(-1.2256,0.8315,0.185),vec3(-0.2405,1.1067,0.185),0.009));
    chain=min(chain,rod(p,vec3(-1.1981,0.6450,0.185),vec3(-0.1755,0.6650,0.185),0.009));
    add(h,chain,14.0);
    h=closer(h,leg(p,1.0,uPedalA,uKneeA));
    h=closer(h,leg(p,-1.0,uPedalB,uKneeB));
    return h;
  }

  vec2 body(vec3 p) {
    float d=egg(p-vec3(-0.53,2.48,0.0),vec3(0.73,0.54,0.435));
    d=smoothUnion(d,taper(p,vec3(-0.11,2.60,0.0),
                         vec3(-0.05,2.86,0.0),0.29,0.225),0.15);
    vec2 h=vec2(d,1.0);
    for(int i=0;i<3;i++) {
      vec3 q=p-vec3(-1.15,2.29,float(i-1)*0.135);
      q.xy=turn(q.xy,0.20);
      add(h,egg(q,vec3(0.40,0.095,0.105)),1.0);
    }
    vec3 w=vec3(p.xy,abs(p.z));
    vec3 q=w-vec3(-0.48,2.49,0.405);
    q.xy=turn(q.xy,0.20);
    float wing=egg(q,vec3(0.61,0.305,0.125));
    wing=smoothUnion(wing,taper(w,vec3(-0.02,2.43,0.43),
                          vec3(0.84,2.17,0.445),0.135,0.052),0.095);
    add(h,wing,1.0);
    for(int i=0;i<4;i++) {
      float f=float(i);
      q=w-vec3(-0.78+f*0.215,2.32-f*0.041,0.463+f*0.003);
      q.xy=turn(q.xy,0.34);
      add(h,egg(q,vec3(0.285,0.083,0.051)),8.0);
      q=w-vec3(-0.80+f*0.215,2.405-f*0.041,0.478+f*0.002);
      q.xy=turn(q.xy,0.30);
      add(h,egg(q,vec3(0.269,0.082,0.054)),1.0);
    }
    add(h,egg(w-vec3(0.81,2.16,0.448),vec3(0.13,0.061,0.073)),8.0);

    add(h,taper(p,vec3(-0.24,3.02,0.16),vec3(-0.64,2.93,0.23),0.058,0.025),9.0);
    add(h,taper(p,vec3(-0.24,3.025,0.16),vec3(-0.57,3.08,0.17),0.045,0.014),9.0);
    return h;
  }

  vec2 head(vec3 p) {
    float d=taper(p,vec3(-0.05,2.77,0.0),vec3(-0.075,3.09,0.0),0.23,0.185);
    d=smoothUnion(d,taper(p,vec3(-0.075,3.09,0.0),
                               vec3(0.13,3.49,0.0),0.185,0.216),0.13);
    d=smoothUnion(d,egg(p-vec3(0.27,3.62,0.0),vec3(0.325,0.307,0.271)),0.12);
    vec2 h=vec2(d,1.0);
    vec3 q=p-vec3(-0.015,3.855,0.0);
    q.xy=turn(q.xy,0.30);
    add(h,egg(q,vec3(0.18,0.045,0.083)),1.0);
    q=p-vec3(-0.01,3.798,0.0);
    q.xy=turn(q.xy,0.42);
    add(h,egg(q,vec3(0.20,0.042,0.090)),1.0);

    q=p-vec3(0.94,3.345,0.0);
    q.xy=turn(q.xy,0.035);
    float pouch=egg(q,vec3(0.65,0.224,0.161));
    pouch=smoothUnion(pouch,taper(p,vec3(0.99,3.355,0.0),
                                     vec3(1.86,3.465,0.0),0.143,0.019),0.10);
    add(h,pouch,5.0);
    float along=clamp((p.x-0.51)/1.36,0.0,1.0);
    q=vec3(p.x,(p.y-(3.57-0.085*along))*1.8,p.z);
    float beak=taper(q,vec3(0.51,0.0,0.0),vec3(1.87,0.0,0.0),0.171,0.025)/1.8;
    add(h,beak,6.0);
    add(h,taper(p,vec3(1.86,3.483,0.0),vec3(1.925,3.415,0.0),0.036,0.026),6.0);
    vec3 s=vec3(p.xy,abs(p.z));
    add(h,rod(s,vec3(0.56,3.550,0.159),vec3(1.858,3.469,0.027),0.0065),16.0);

    add(h,egg(s-vec3(0.373,3.711,0.250),vec3(0.084,0.089,0.038)),15.0);
    add(h,egg(s-vec3(0.379,3.713,0.277),vec3(0.057,0.061,0.040)),12.0);
    add(h,length(s-vec3(0.361,3.736,0.312))-0.014,13.0);
    add(h,length(s-vec3(0.398,3.696,0.313))-0.006,13.0);
    add(h,rod(s,vec3(0.295,3.788,0.245),vec3(0.405,3.794,0.240),0.020),1.0);
    q=p-vec3(-0.073,3.02,0.0);
    add(h,length(vec2(length(q.xz)-0.189,q.y))-0.038,9.0);
    add(h,egg(p-vec3(-0.235,3.02,0.17),vec3(0.081,0.066,0.065)),9.0);
    return h;
  }

  vec2 scene(vec3 p) {
    float a=box(p-vec3(0.0,0.79,0.0),vec3(1.995,0.85,0.205));
    vec2 h=a<0.13?wheels(p):vec2(a,0.0);
    a=box(p-vec3(0.05,1.40,0.0),vec3(1.40,0.91,0.59));
    h=closer(h,a<0.13?frame(p):vec2(a,0.0));
    a=box(p-vec3(-0.27,2.47,0.0),vec3(1.36,0.68,0.64));
    h=closer(h,a<0.13?body(p):vec2(a,0.0));
    a=box(p-vec3(0.69,3.32,0.0),vec3(1.39,0.73,0.37));
    h=closer(h,a<0.13?head(p):vec2(a,0.0));
    return h;
  }

  vec3 normalAt(vec3 p) {
    vec2 e=vec2(0.00075,-0.00075);
    return normalize(e.xyy*scene(p+e.xyy).x+
                     e.yyx*scene(p+e.yyx).x+
                     e.yxy*scene(p+e.yxy).x+
                     e.xxx*scene(p+e.xxx).x);
  }
  float shadow(vec3 p) {
    float t=0.023, s=1.0;
    for(int i=0;i<13;i++) {
      float d=scene(p+LIGHT*t).x;
      s=min(s,10.0*max(d,0.0)/t);
      t+=clamp(d,0.035,0.42);
      if(s<0.025||t>3.6) break;
    }
    return clamp(s,0.0,1.0);
  }
  float occlusion(vec3 p, vec3 n) {
    float a=0.0;
    a+=(0.045-scene(p+n*0.045).x)*0.85;
    a+=(0.13-scene(p+n*0.13).x)*0.48;
    a+=(0.30-scene(p+n*0.30).x)*0.23;
    return clamp(1.0-a*2.5,0.43,1.0);
  }
  vec3 sky(vec3 d) {
    return mix(vec3(0.79,0.84,0.75),vec3(0.36,0.57,0.60),
               smoothstep(-0.20,0.90,d.y));
  }
  void material(float id,vec3 p,out vec3 c,out float rough,out float metal) {
    rough=0.57; metal=0.0;
    c=vec3(0.90,0.89,0.80);
    if(id<1.5) {
      c*=0.985+0.015*sin(p.x*72.0+p.y*23.0+sin(p.z*37.0));
    } else if(id<2.5) {
      c=vec3(0.021,0.030,0.032); rough=0.85;
      vec3 q=p-vec3(p.x<0.0?-1.2:1.2,0.74,0.0);
      float r=length(q.xy);
      if(abs(q.z)>0.034&&abs(r-0.656)<0.053) {
        c=vec3(0.68,0.58,0.39);
        c*=0.96+0.04*cos((r-0.656)*190.0);
      } else {
        c*=0.84+0.16*smoothstep(0.15,0.40,abs(sin(atan(q.y,q.x)*56.0+q.z*100.0)));
      }
    } else if(id<3.5) {
      c=vec3(0.61,0.69,0.68); rough=0.21; metal=0.86;
    } else if(id<4.5) {
      c=vec3(0.025,0.32,0.30); rough=0.29; metal=0.24;
    } else if(id<5.5) {
      c=vec3(0.98,0.54,0.18)*(0.95+0.05*sin(p.z*90.0+p.x*2.0));
      rough=0.62;
    } else if(id<6.5) {
      c=vec3(0.99,0.40,0.065)*(0.91+0.09*exp(-abs(p.z)*25.0));
      rough=0.37;
    } else if(id<7.5) {
      c=vec3(0.81,0.255,0.065)*(0.96+0.04*sin(p.y*110.0));
      rough=0.53;
    } else if(id<8.5) {
      c=vec3(0.15,0.215,0.25); rough=0.65;
    } else if(id<9.5) {
      c=vec3(0.70,0.055,0.034); rough=0.80;
      c*=0.96+0.04*sin(p.x*110.0)*sin(p.y*120.0);
    } else if(id<10.5) {
      c=vec3(0.145,0.058,0.029); rough=0.48;
    } else if(id<11.5) {
      c=vec3(0.86,0.79,0.57); rough=0.32; metal=0.13;
    } else if(id<12.5) {
      c=vec3(0.007,0.012,0.015); rough=0.08;
    } else if(id<13.5) {
      c=vec3(1.3); rough=0.08;
    } else if(id<14.5) {
      c=vec3(0.16,0.20,0.20)*(0.72+0.28*step(0.0,sin(p.x*220.0+p.y*50.0)));
      rough=0.29; metal=0.8;
    } else if(id<15.5) {
      c=vec3(0.71,0.45,0.16); rough=0.25; metal=0.73;
    } else {
      c=vec3(0.32,0.105,0.035); rough=0.55;
    }
  }
  vec3 shade(vec3 p,vec3 rd,float id) {
    vec3 n=normalAt(p);
    if(dot(n,-rd)<0.0) n=-n;
    vec3 base;
    float rough,metal;
    material(id,p,base,rough,metal);
    if(id>12.5&&id<13.5) return base;
    float ao=occlusion(p,n);
    float sh=shadow(p+n*0.004);
    float nl=max(dot(n,LIGHT),0.0);
    vec3 ambient=mix(vec3(0.38,0.41,0.34),vec3(0.64,0.77,0.79),n.y*0.5+0.5);
    vec3 color=base*(ambient*0.58*ao+
                     vec3(1.10,0.96,0.75)*nl*sh*0.88)*(1.0-metal*0.58);
    float fill=max(dot(n,normalize(vec3(-0.7,0.3,-0.8))),0.0);
    color+=base*vec3(0.35,0.51,0.61)*fill*0.20*ao;
    vec3 h=normalize(LIGHT-rd);
    float power=mix(150.0,13.0,rough*rough);
    float spec=pow(max(dot(n,h),0.0),power);
    vec3 specColor=mix(vec3(0.12),base,metal);
    color+=specColor*spec*sh*1.35;
    float fres=pow(1.0-max(dot(n,-rd),0.0),5.0);
    color+=sky(reflect(rd,n))*mix(0.027,0.30,metal)*(0.32+0.68*fres)*ao;
    return color;
  }
  vec3 floorColor(vec3 p,float t,vec3 background) {
    vec2 v=p.xz;
    vec3 c=mix(vec3(0.72,0.76,0.65),vec3(0.80,0.81,0.70),
                exp(-dot(v,v)*0.055));
    float s=0.0;
    vec2 lightSlope=LIGHT.xz/LIGHT.y;
    vec2 q=v-vec2(-0.5,0.0)+lightSlope*2.4;
    s+=0.20*exp(-dot(q/vec2(0.95,0.69),q/vec2(0.95,0.69))*1.4);
    q=v-vec2(0.6,0.0)+lightSlope*3.4;
    s+=0.10*exp(-dot(q/vec2(0.95,0.49),q/vec2(0.95,0.49))*1.6);
    for(int i=0;i<2;i++) {
      float x=i==0?-1.2:1.2;
      q=v-vec2(x,0.0)+lightSlope*0.38;
      s+=0.12*exp(-dot(q/vec2(0.64,0.26),q/vec2(0.64,0.26))*1.4);
      q=v-vec2(x,0.0);
      s+=0.50*exp(-dot(q/vec2(0.19,0.075),q/vec2(0.19,0.075))*1.6);
    }
    c*=1.0-clamp(s,0.0,0.65);
    return mix(c,background,1.0-exp(-0.014*t));
  }
  vec2 bounds(vec3 ro,vec3 rd) {
    vec3 lo=vec3(-2.09,-0.06,-0.73);
    vec3 hi=vec3(2.13,4.10,0.73);
    vec3 inv=1.0/(rd+vec3(1e-9));
    vec3 a=(lo-ro)*inv,b=(hi-ro)*inv;
    vec3 mn=min(a,b),mx=max(a,b);
    return vec2(max(mn.x,max(mn.y,mn.z)),min(mx.x,min(mx.y,mx.z)));
  }
  vec3 film(vec3 x) {
    return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
  }
  void main() {
    vec2 uv=(2.0*gl_FragCoord.xy-uResolution)/uResolution.y;
    vec3 rd=normalize(uRight*uv.x+uUp*uv.y+uForward*2.65);
    vec3 background=sky(rd);
    float floorT=10000.0;
    if(uEye.y>-0.035&&rd.y<-0.0001)
      floorT=(-0.035-uEye.y)/rd.y;
    vec3 color=background;
    if(floorT<150.0)
      color=floorColor(uEye+rd*floorT,floorT,background);
    vec2 span=bounds(uEye,rd);
    float t=max(span.x,0.015);
    float end=min(span.y,floorT);
    vec2 hit=vec2(1.0,0.0);
    bool found=false;
    if(end>t) {
      for(int i=0;i<124;i++) {
        hit=scene(uEye+rd*t);
        float eps=0.00042+t*0.000075;
        if(abs(hit.x)<eps&&hit.y>0.5) { found=true; break; }
        t+=max(abs(hit.x)*0.84,0.0003);
        if(t>end) break;
      }
    }
    if(found) {
      color=shade(uEye+rd*t,rd,hit.y);
      color=mix(color,background,1.0-exp(-t*0.010));
    }
    color=pow(film(max(color,0.0)),vec3(1.0/2.2));
    float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;
    outColor=vec4(clamp(color+grain*0.0021,0.0,1.0),1.0);
  }`;

  let program = null, vao = null, uniforms = {};
  let disposed = false, lost = false, lastTime = 0;
  let yaw = 0.40, pitch = 0.16, distance = 6.45;
  const center = [0.08, 1.99, 0];
  const target = center.slice();
  const listeners = [];
  const pointers = new Map();
  const oldTouchAction = canvas.style.touchAction;
  const oldCursor = canvas.style.cursor;
  const oldTabIndex = canvas.getAttribute("tabindex");
  const oldLabel = canvas.getAttribute("aria-label");

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Pelican SDF could not allocate a shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error("Pelican SDF shader compilation failed: " + message);
    }
    return shader;
  }

  function initialize() {
    let vs = null, fs = null, nextProgram = null, nextVao = null;
    try {
      vs = compile(gl.VERTEX_SHADER, vertexSource);
      fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      nextProgram = gl.createProgram();
      if (!nextProgram) throw new Error("Pelican SDF could not allocate a program.");
      gl.attachShader(nextProgram, vs);
      gl.attachShader(nextProgram, fs);
      gl.linkProgram(nextProgram);
      if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS))
        throw new Error("Pelican SDF shader link failed: " + gl.getProgramInfoLog(nextProgram));
      nextVao = gl.createVertexArray();
      if (!nextVao) throw new Error("Pelican SDF could not allocate a vertex array.");
      program = nextProgram;
      vao = nextVao;
      uniforms = {};
      for (const name of [
        "uResolution", "uWheel", "uCrank", "uEye", "uRight", "uUp",
        "uForward", "uPedalA", "uPedalB", "uKneeA", "uKneeB"
      ]) uniforms[name] = gl.getUniformLocation(program, name);
    } catch (error) {
      if (nextProgram) gl.deleteProgram(nextProgram);
      if (nextVao) gl.deleteVertexArray(nextVao);
      throw error;
    } finally {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
  }
  initialize();

  function basis() {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    return {
      right: [cy, 0, -sy],
      up: [-sy * sp, cp, -cy * sp],
      forward: [-sy * cp, -sp, -cy * cp],
      eye: [
        target[0] + distance * sy * cp,
        target[1] + distance * sp,
        target[2] + distance * cy * cp
      ]
    };
  }

  function kneeFor(pedal, side) {
    const dx = pedal[0] - 0.045 + 0.49;
    const dy = pedal[1] + 0.15 - 2.08;
    const d = Math.max(Math.hypot(dx, dy), 0.001);
    const a = (0.71 * 0.71 - 0.75 * 0.75 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, 0.71 * 0.71 - a * a));
    return [-0.49 + (dx * a - dy * h) / d,
      2.08 + (dy * a + dx * h) / d, side * 0.30];
  }

  function render(timeSeconds) {
    if (disposed || lost || gl.isContextLost()) return;
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    if (!width || !height) return;
    lastTime = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const phase = -(lastTime % 100000) * 1.25 - 0.60;
    const c = Math.cos(phase), s = Math.sin(phase);
    const pedalA = [-0.18 + 0.28 * c, 0.89 + 0.28 * s, 0.36];
    const pedalB = [-0.18 - 0.28 * c, 0.89 - 0.28 * s, -0.36];
    const kneeA = kneeFor(pedalA, 1), kneeB = kneeFor(pedalB, -1);
    const camera = basis();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.uResolution, width, height);
    gl.uniform2f(uniforms.uWheel, Math.cos(-phase * 2.35), Math.sin(-phase * 2.35));
    gl.uniform2f(uniforms.uCrank, c, -s);
    gl.uniform3fv(uniforms.uEye, camera.eye);
    gl.uniform3fv(uniforms.uRight, camera.right);
    gl.uniform3fv(uniforms.uUp, camera.up);
    gl.uniform3fv(uniforms.uForward, camera.forward);
    gl.uniform3fv(uniforms.uPedalA, pedalA);
    gl.uniform3fv(uniforms.uPedalB, pedalB);
    gl.uniform3fv(uniforms.uKneeA, kneeA);
    gl.uniform3fv(uniforms.uKneeB, kneeB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function normalizeView() {
    yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    pitch = clamp(pitch, -1.46, 1.46);
    distance = clamp(distance, 0.70, 18);
  }
  function setView(nextYaw, nextPitch, nextDistance) {
    if (disposed) return;
    if (Number.isFinite(nextYaw)) yaw = nextYaw;
    if (Number.isFinite(nextPitch)) pitch = nextPitch;
    if (Number.isFinite(nextDistance)) distance = nextDistance;
    normalizeView();
    target[0] = center[0];
    target[1] = center[1];
    target[2] = center[2];
  }
  function getView() {
    return { yaw, pitch, distance };
  }
  function pan(dx, dy, height) {
    const b = basis();
    const scale = 2 * distance / (2.65 * Math.max(height, 1));
    for (let i = 0; i < 3; i++)
      target[i] += (-b.right[i] * dx + b.up[i] * dy) * scale;
  }
  function zoom(factor, x, y, anchor) {
    const previous = distance;
    distance = clamp(distance * factor, 0.70, 18);
    if (anchor && previous !== distance) {
      const rect = canvas.getBoundingClientRect();
      const b = basis();
      const h = Math.max(rect.height, 1);
      const sx = (2 * (x - rect.left) - rect.width) * previous / (h * 2.65);
      const sy = (rect.height - 2 * (y - rect.top)) * previous / (h * 2.65);
      const amount = 1 - distance / previous;
      for (let i = 0; i < 3; i++)
        target[i] += (b.right[i] * sx + b.up[i] * sy) * amount;
    }
  }
  function listen(type, fn, options) {
    canvas.addEventListener(type, fn, options);
    listeners.push([type, fn, options]);
  }
  function focusCanvas() {
    try { canvas.focus({ preventScroll: true }); }
    catch (_) { canvas.focus(); }
  }

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  if (oldLabel === null)
    canvas.setAttribute("aria-label",
      "Pelican bicycle sculpture. Drag to orbit, scroll or pinch to zoom. Shift-drag or two-finger drag to pan. Arrow keys orbit, plus and minus zoom, zero resets.");

  listen("pointerdown", event => {
    if (disposed) return;
    event.preventDefault();
    focusCanvas();
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      pan: event.button === 2 || event.button === 1 || event.shiftKey
    });
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    canvas.style.cursor = "grabbing";
  }, { passive: false });

  listen("pointermove", event => {
    if (!pointers.has(event.pointerId) || disposed) return;
    event.preventDefault();
    const before = Array.from(pointers.values());
    const old = pointers.get(event.pointerId);
    const dx = event.clientX - old.x, dy = event.clientY - old.y;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, pan: old.pan
    });
    const after = Array.from(pointers.values());
    const rect = canvas.getBoundingClientRect();
    if (before.length >= 2) {
      const a = before[0], b = before[1], c = after[0], d = after[1];
      const oldSpan = Math.hypot(a.x - b.x, a.y - b.y);
      const newSpan = Math.hypot(c.x - d.x, c.y - d.y);
      if (oldSpan > 2 && newSpan > 2)
        zoom(oldSpan / newSpan, (c.x + d.x) / 2, (c.y + d.y) / 2, true);
      pan((c.x + d.x - a.x - b.x) / 2,
          (c.y + d.y - a.y - b.y) / 2, rect.height);
    } else if (old.pan || event.shiftKey) {
      pan(dx, dy, rect.height);
    } else {
      const scale = 4.5 / Math.max(200, Math.min(rect.width, rect.height));
      yaw -= dx * scale;
      pitch += dy * scale;
      normalizeView();
    }
    render(lastTime);
  }, { passive: false });

  function pointerEnd(event) {
    pointers.delete(event.pointerId);
    try {
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
    canvas.style.cursor = pointers.size ? "grabbing" : "grab";
  }
  listen("pointerup", pointerEnd);
  listen("pointercancel", pointerEnd);
  listen("lostpointercapture", event => {
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.style.cursor = "grab";
  });
  listen("contextmenu", event => event.preventDefault());
  listen("wheel", event => {
    if (disposed) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    zoom(Math.exp(clamp(event.deltaY * units, -900, 900) * 0.0013),
      event.clientX, event.clientY, true);
    render(lastTime);
  }, { passive: false });
  listen("keydown", event => {
    if (disposed) return;
    const step = event.shiftKey ? 0.035 : 0.10;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft": yaw -= step; break;
      case "ArrowRight": yaw += step; break;
      case "ArrowUp": pitch += step; break;
      case "ArrowDown": pitch -= step; break;
      case "+": case "=": zoom(0.88, 0, 0, false); break;
      case "-": case "_": zoom(1 / 0.88, 0, 0, false); break;
      case "0": case "Home": setView(0.40, 0.16, 6.45); break;
      default: handled = false;
    }
    if (handled) {
      event.preventDefault();
      normalizeView();
      render(lastTime);
    }
  });
  listen("webglcontextlost", event => {
    event.preventDefault();
    lost = true;
  });
  listen("webglcontextrestored", () => {
    if (disposed) return;
    try {
      initialize();
      lost = false;
      render(lastTime);
    } catch (_) {
      lost = true;
    }
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [type, fn, options] of listeners)
      canvas.removeEventListener(type, fn, options);
    for (const id of pointers.keys()) {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch (_) {}
    }
    pointers.clear();
    canvas.style.touchAction = oldTouchAction;
    canvas.style.cursor = oldCursor;
    if (oldTabIndex === null) canvas.removeAttribute("tabindex");
    else canvas.setAttribute("tabindex", oldTabIndex);
    if (oldLabel === null) canvas.removeAttribute("aria-label");
    if (program) gl.deleteProgram(program);
    if (vao) gl.deleteVertexArray(vao);
    program = null;
    vao = null;
    uniforms = {};
  }

  render(0);
  return { render, setView, getView, dispose };
}
